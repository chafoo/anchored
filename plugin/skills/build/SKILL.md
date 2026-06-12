---
name: build
description: Execute the build stage of an anchored node — orchestrate its children to completion in-session, spawning the build agents and driving the failures-driven re-do loop. Triggers ONLY on the explicit `/a:build <slug>` command. Use for `/a:build`, not for general "build the app" requests.
---

# /a:build — fractal build stage (skill-orchestrated)

Explicit-only: the user typed `/a:build <slug>`.

## Communication style

Partner voice in chat, machinery only in the audit trail — see
`plugin/references/communication-style.md`. The CLI verbs, status flips, and the
each:task loop are plumbing; the user hears outcomes:

| Avoid (machinery) | Prefer (partner) |
|---|---|
| "set-child-status … in-progress" | "Phase 2 (Persistence) angefangen." |
| "core-list fährt seinen JIT-Lifecycle plan→refine→build→wrap" | "Ich baue core-list zuerst — von der Planung bis fertig." |
| "task-validate verdict=fail, rejected_count=2" | "Zwei Akzeptanz-Kriterien hängen noch — ich versuch's nochmal mit den findings als fix-liste." |
| "flip auf wrap / next-child → null" | "Build durch — alle phasen grün. Review steht." |

**Vor jeder user-facing Zeile** das Jargon-Mapping aus `communication-style.md`
anwenden — Framework-Begriffe (scaffold, stub, seam, grounding, roll-up,
outcome-AC, executor, der each-Loop, drafted/refined, concern, DAG/JIT) gehören
nie in den Chat, nur ihr Klartext.

The skill is the **orchestrator**: it runs in-session (it has the plugin + agents
loaded), consults the `anchored` CLI for the deterministic step-plan + all node
ops, and spawns each worker itself via the **Task tool**. The CLI never spawns
agents — a headless subprocess can't reach the session's Task tool. Agents
self-write their results via `anchored node …` (see
`plugin/references/agent-contract.md`).

## Pre-flight

1. `anchored node read <slug>` — the **tier is derived from the node**. (A
   missing `anchored.yml` is fine — the CLI falls back to the framework defaults;
   it lazy-inits a minimal one + the `Bash(anchored *)` allowlist on first use.)
2. State gate: `refined` → flip up front `anchored node set-status <slug> build`
   (so the terminal `build → wrap` is legal); `build` → resume directly; `plan`/
   `drafted` → tell the user to run `/a:plan` + `/a:refine` first; `wrap`/`done`
   → already past build.
3. **Pre-build walk:** if the node still has open `questions[]` (e.g. a skip-refine
   shortcut), clear them BEFORE the long run using the SAME walk-style choice as
   `/a:refine` (all-together / high-together (default) / AI-all) — `AskUserQuestion`
   first, then resolve each (`resolve-question … user|ai ["<reasoning>"]`). Each
   `AskUserQuestion` follows `plugin/references/question-style.md` — recommended
   option first (`(Empfohlen)`) + implication bullets in the text; work them out at
   ask-time if the question is terse. **0 open questions → skip this silently.**
   (Build's own autonomy is for EMERGENT build-time decisions only; pre-existing
   plan questions go through the walk.)

## Get the orchestration plan

```bash
anchored build <slug>      # → { stage, tier, node, steps }   (does NOT spawn)
```

`steps` is the resolved, config-driven plan. For a **looping tier** it is a single
`{ kind: 'loop', each: <child-tier>, stop, retry_limit }` — that is the recursion
edge you drive below. For a **leaf phase** it is the worker pipeline
(`implement → task-validate → code-validate`).

## Drive the loop (task.build.each: phase / epic.build.each: task)

While `anchored node next-child <slug>` returns a child (else done):

1. **Mark the child in-flight** — the marker word is **tier-dependent** (the CLI
   rejects the wrong one with `InvalidChildStatus`):
   - **task → phase**: `anchored node set-child-status <slug> <phase> in-progress`
   - **epic → task**: `anchored node set-child-status <slug> <task> active`
     (a task-stub is a loop-queue marker: `pending|active|done|blocked`, NOT the
     phase word `in-progress` — that mismatch bricked an epic in the dogfood).
2. **Per-child body:**
   - **task → phase** (leaf): `anchored steps phase build` gives
     `[implement, task-validate, code-validate]`. Spawn **build-implement** via the
     Task tool with the agent-contract input `{ task-slug: <slug>, phase-slug:
     <child>, tier: phase, stage: build, context, rules }`. It writes code +
     self-writes evidence: `anchored node add-phase-evidence <slug> <child> <ac-id>
     "<proof>"` per AC. Then spawn the two gates **in parallel** (build-task-validate
     + build-code-validate) — pure inspectors.
   - **epic → task**: the child runs its OWN full JIT lifecycle, then the epic-child
     is marked delivered. Per ready child (the loop's body is the child's
     plan→refine→build→wrap, NOT a phase pipeline):
     1. **JIT plan** — `anchored plan task <child-slug>` creates the child task-file.
        **Seed its decomposition from the stub's outcome-ACs** (the Epic→Task
        contract epic-decompose wrote): read them
        (`anchored node read <epic-slug>` → `tasks[].acceptance_criteria`) and pass
        them to plan-decompose as the outcome bar the phases must meet — so the
        goal/contract is never lost (the G8 fix). Run plan's steps → `drafted`.
     2. **Refine the child** (`/a:refine`-style: plan-check + rules-check + walk) →
        `refined`. Apply the **epic-wide question policy** the user set at the
        epic-refine (held in your working memory for this run, H3) — do NOT re-ask
        the walk-style per child. For each child question, route it by that policy:
        priority-threshold / all-user / all-AI, OR — if the user gave a free-form
        condition — **judge each question against their words** ("does this touch
        what they asked to be involved in?"): a match goes to the user, the rest you
        resolve yourself with reasoning. If you reach the build WITHOUT a remembered
        policy (fresh session, or refine was skipped), ask it once now — same choice
        as the epic-refine walk (see refine SKILL "Epic-wide question policy").
     3. **Build the child** — recurse THIS loop on the child task (`each: phase`).
     4. **Wrap the child** (review + summarize) → child task `done`.
     5. Mark the epic-child delivered:
        `anchored node set-child-status <epic-slug> <child> done`.
     The stub's outcome-ACs are validated at the EPIC wrap (epic-roll-up,
     hard-with-reconcile), not here.
3. **Gates + failures (the re-do loop):** the gates REJECT a bad AC by self-writing
   `anchored node set-failures <slug> <phase> <ac-id> "<why>"` — that flips the AC
   back to `pending` with its `failures` recorded. Read the child back
   (`anchored node read <slug>`); for each AC carrying `failures`, re-spawn
   build-implement with those failures as the fix-list, then re-run the gates. Retry
   up to `retry_limit` (default 3); on exhaustion → blocked (see Failure-handling).
4. **Advance:** when all the child's ACs are `done` (with evidence) and both gates
   pass → `anchored node set-child-status <slug> <child> done`. This is the **only**
   place a phase reaches `done` — the build-implement agent is evidence-only and
   never flips the phase status (G4: that flip must come AFTER the gates, never
   before, or the gates would inspect an already-`done` phase).
5. **Run the phase's trailing custom steps (commit, etc.)** — only now, on a green
   phase. See "Custom run/use steps" below. A `kind: 'run'` step that fails is a
   real failure: surface it and stop the loop (do not silently swallow a failed
   commit), it does not re-open the already-`done` phase.

## Custom run/use steps (the config's own steps — commit, push, coverage …)

`anchored steps <tier> <stage>` returns the FULL config-driven plan, not just the
known workers. Besides `kind: 'worker'` (spawn the plugin agent) and `kind: 'loop'`
(the recursion edge), a step can be:

- **`kind: 'run'`** — a shell command from the user's `anchored.yml` (e.g. a
  per-phase `commit`, a `push`, a `coverage` gate). **YOU execute it via Bash**, in
  declaration order, at the point it sits in the plan. For `phase.build` the
  trailing run-steps fire in step 5 above (after the gates + advance, on a green
  phase); a run-step positioned *before* a worker runs before that worker. A `run:`
  step may carry **`instructions:`** — prose you read and follow when executing the
  command (conditions, how to treat its output/errors, ordering hints). This is
  uniform with the `use:` step's `instructions`.
- **`kind: 'use'`** — spawn the named subagent (or, with `type: skill`, invoke the
  skill) with the step's `instructions` + the same phase/task context the workers get.

**Variable contract (every `run` step gets these as environment variables).** The
config author writes `${TASK_SLUG}` / `${PHASE_SLUG}` etc.; you make them real env
vars so the shell expands them — never string-substitute by hand:

| Variable | Value | Available in |
|---|---|---|
| `TASK_SLUG` | the task-file being built (an epic child → the child's slug) | all build run-steps |
| `PHASE_SLUG` | the phase just built | `phase.build` run-steps |
| `PHASE_NAME` | the phase's plain-text name | `phase.build` run-steps |
| `EPIC_SLUG` | the parent epic slug, or empty when not in an epic | all build run-steps |

Run it as, e.g.:
```bash
TASK_SLUG='core-list' PHASE_SLUG='persistence' PHASE_NAME='Local persistence' EPIC_SLUG='' bash -c "$STEP_RUN"
```
where `$STEP_RUN` is the step's `run` string verbatim. **Per-phase commits don't
leak into chat** — narrate the phase outcome ("Phase 2 grün, committed."), not the
git plumbing (see communication-style.md). Git is never the framework's concern: if
the user wants to capture a SHA into a field, their own `run:` script does it
(`anchored node set-field "${TASK_SLUG}" commit_sha "$(git rev-parse HEAD)"`).

> **Fan-out runs under git worktree isolation — directive, not caveat.** Every
> fan-out worker runs in its **own git worktree** — both the per-AC **phase** fan-out
> (workflow mode, below) and the **task-level** parallel fan-out (epic). A per-task
> branch (`task/<slug>`) assumes a single working tree, so N parallel workers
> `git switch`-ing one shared checkout would clobber each other; isolated worktrees
> never contend. This is what makes "fastest where safe" robust even against a wrong
> independence call — isolated worktrees merge cleanly, and the cross-process lock +
> CAS catch the rest. Worktree isolation is the **default for any fan-out**, not a
> fallback to a sequential loop.

## Epic task-level fan-out (parallel independent children, q8)

The loop above is sequential (one `next-child` at a time). For an **epic**, the
bigger speed lever is **task-level parallelism**: independent child-tasks at the
same DAG level (e.g. three comfort-features that all depend only on `core-list`)
have no reason to build one-after-another. When the runtime has the **Workflow
tool**, fan them out:

1. **Get the batch:** `anchored node ready-children <epic-slug>` returns ALL
   currently-runnable children (pending + every dependency done) — the fan-out set,
   not just the first. If it has ≤1 entry, just run the sequential loop.
2. **Mark + dispatch:** set each batch child `active`, then dispatch them as a
   **Dynamic Workflow**, one unit per child, each unit running that child's FULL
   JIT lifecycle (plan→refine→build→wrap, the epic→task body above). Up to the
   hard ≤16 parallel ceiling; larger batches run in waves.
3. **Lock-safety:** each child writes its OWN task-file; the only shared surface is
   the epic's `tasks[]` status updates (`set-child-status`). The CLI's cross-process
   lock + validate-before-write (G1) serialize those safely — concurrent child
   status writes never corrupt the epic.
4. **Walk-questions are BUFFERED:** a child's refine walk can't prompt the user from
   a background unit. In a fan-out run, the child AI-resolves whatever the epic-wide
   question policy (H3) lets it, and **records any question the policy routes to the
   user on its task-file** (`add-question`) instead of prompting — exactly like the
   phase-workflow buffering. At the **join**, the orchestrator reads each child's open
   questions and walks those buffered ones with the user (per the same policy), then
   continues.
5. **Join + advance:** when a unit's child task reaches `done`, mark its epic-child
   delivered (`set-child-status <epic-slug> <child> done`). Re-run `ready-children`
   for the next wave until the queue drains, then terminate as below.

Fall back to the sequential loop when the Workflow tool is unavailable (same
feature-detection + fallback contract as the phase-level fan-out). Phase-level
fan-out (executor, G12) and this task-level fan-out are independent levers that
compose: a workflow phase inside a workflow child-task.

## Emergent decisions → document or stop (the decision-trail)

build runs maximally autonomous, but **every emergent decision lands on the
record** — that is the USP ("every decision on the record"). The build-implement
worker self-reports decisions the plan didn't fully nail down (which library, which
error shape, extend-vs-replace) in its build-notes (`append-log <slug> build
learning "…"`). For EACH such decision, run the **stop-check**:

- **Does it match a `build.stop` rule?** (the `stop[]` array comes from `anchored
  steps <tier> build`; the shipped default is *"a decision deviates from the
  plan"*.) Judge the decision against those rules — a genuine plan/architecture
  deviation matches; a within-plan local call does not.
- **No match → proceed + document autonomously:** mint/resolve a question so the
  decision + its WHY are on the record (read by `/a:wrap`):
  ```bash
  anchored node add-question <slug> "<the decision>" high          # → q<n>
  anchored node resolve-question <slug> q<n> "<the decision>" ai "<why, the reasoning>"
  ```
  (`resolve-question` with `source=ai` REQUIRES the reasoning — the substrate
  rejects an AI decision with no recorded why.) Then keep building.
- **Match → STOP + escalate:** `anchored node add-question <slug> "Build halted by
  stop-rule: <decision>" high`, surface it to the user, walk it
  (`resolve-question … user "<answer>"`), then continue. Minimise stops — proceed-
  and-document within-plan calls; stop only on a genuine deviation.

## Failure-handling (never silent — a5)

- **Agent returns nothing / errors** → treat as a failed AC: record it as a
  `failures` entry and retry (counts toward `retry_limit`).
- **retry_limit exhausted** → `anchored node set-child-status <slug> <child>
  blocked`, note what was tried in `anchored node append-log <slug> build blocker
  "<phase> blocked after N attempts: <ACs>"`, then continue with the next child
  (the wrap reviewer surfaces blocked phases). Retry-exhaustion is a bounded
  mechanical limit, NOT a stop.
- **stop-condition** (a worker flags a decision matching a `build.stop` rule, e.g.
  *"a decision deviates from the plan"*) → **halt** the loop, record the decision
  `anchored node append-log <slug> build decision "STOP: <decision>"`, surface it to
  the user, and walk it before continuing. Minimise stops — proceed-and-document
  within-plan calls; stop only on a genuine deviation.

## Workflow mode (fan-out) — the skill drives it via the Workflow tool

When a phase carries `executor: workflow` (set via `anchored node set-executor
<slug> <phase> workflow`) and the `Workflow` tool is available, **the SKILL** fans
the phase's acceptance criteria out as a Dynamic Workflow — one parallel unit per
not-yet-evidenced AC (the engine's `loop-workflow.ts` is a headless reference; the
live fan-out lives here). The flow, sibling to the sequential implement path:

1. **Plan the units.** Read the phase (`anchored node read <slug>`). A unit = one AC
   that is `pending` OR carries `failures` (skip ACs already `done` with evidence —
   resume-safety). ≤16 units in parallel; >16 → waves of 16.
2. **Dispatch (Workflow tool).** One `agent({ agentType: 'a:build-workflow',
   isolation: 'worktree', … })` per unit (the `build-workflow` plugin agent — the
   per-AC fan-out worker), each in its **own git worktree** per the fan-out directive
   above, so parallel units never contend on one checkout. Each unit does its AC's
   work and **self-writes its own evidence/failures via the CLI**
   (`anchored node add-phase-evidence …` on success, `anchored node set-failures …`
   on a blocker). Background — emit one progress line, then return; the await is
   **re-invocation**, not polling.
3. **Collect (evidence-driven, resume-safe).** On re-engage, re-read the task-file;
   for each AC: `done`+evidence ⇒ satisfied, anything `pending`/`failures` ⇒
   re-dispatch ONLY that unit. No per-worker return to apply — the workers wrote to
   disk (do NOT double-apply).
4. **Gates ONCE over the merged result.** After the fan-out joins, spawn
   build-task-validate + build-code-validate once over the whole phase (never
   per-unit). Failures → the re-do loop (re-dispatch the not-yet-evidenced units),
   retry to `retry_limit`, stop-check unchanged.

**Hard precondition: `Bash(anchored *)` must be pre-approved on the allowlist** — a
background workflow has no interactive session, so an un-allowlisted `anchored` call
hangs. If the `Workflow` tool / `anchored:workflow` agent is unavailable, **fall back
to the sequential implement path** (never hard-error).

## Termination

When `next-child` returns null and at least one child is `done` (none
in-progress): `anchored node set-status <slug> wrap`. Tell the user in plain words —
no status word, no `P/Q` codes: *"Build durch — P von Q fertig (R hängen noch).
Nächster Schritt: `/a:wrap`."* (drop the bracketed clause when nothing is blocked.)
No MCP, no raw node-file edit — every mutation goes through the `anchored` CLI.
