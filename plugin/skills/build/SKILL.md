---
name: build
description: Execute the build stage of an anchored tier node — orchestrate its children to completion in-session, spawning the build agents and driving the failures-driven re-do loop. Triggers ONLY on the explicit `/a:build <slug>` command. Use for `/a:build`, not for general "build the app" requests.
---

# /a:build — fractal build stage (skill-orchestrated)

Explicit-only: the user typed `/a:build <slug>`.

## Communication style

Partner voice in chat, machinery only in the audit trail — see
`plugin/references/communication-style.md`. The CLI verbs, status flips, and the
each:task loop are plumbing; the user hears outcomes:

| Avoid (machinery) | Prefer (partner) |
|---|---|
| "set-child-status … in-progress" | "Started phase 2 (Persistence)." |
| "core-list runs its just-in-time lifecycle plan→refine→build→wrap" | "I'll build core-list first — from planning to done." |
| "task-validate verdict=fail, rejected_count=2" | "Two acceptance criteria still pending — I'll retry with the findings as a fix-list." |
| "flip to wrap / next-child → null" | "Build's done — all phases green. Review's up next." |

**Before every user-facing line**, apply the jargon mapping from
`communication-style.md` — framework terms (scaffold, stub, seam, grounding,
roll-up, outcome acceptance criteria, executor, the each-loop, drafted/refined,
concern, dependency graph, just-in-time) never belong in chat, only their plain
words.

The skill is the **orchestrator**: it runs in-session (it has the plugin + agents
loaded), consults the `anchored` CLI for the deterministic step-plan + all node
ops, and spawns each worker itself via the **Task tool**. The CLI never spawns
agents — a headless subprocess can't reach the session's Task tool. Agents
self-write their results via `anchored <tier> …` (see
`plugin/references/agent-contract.md`).

## Pre-flight

1. `anchored <tier> get <slug>` — the **tier is derived from the node**. (A
   missing `anchored.yml` is fine — the CLI falls back to the framework defaults;
   it lazy-inits a minimal one + the `Bash(anchored *)` allowlist on first use.)
2. State gate: `refined` → flip up front `anchored <tier> status <slug> build`
   (so the terminal `build → wrap` is legal); `build` → resume directly; `plan`/
   `drafted` → tell the user to run `/a:plan` + `/a:refine` first; `wrap`/`done`
   → already past build.
3. **Pre-build walk:** if the node still has open `questions[]` (e.g. a skip-refine
   shortcut), clear them BEFORE the long run using the SAME walk-style choice as
   `/a:refine` (all-together / high-together (default) / AI-all) — `AskUserQuestion`
   first, then resolve each (`resolve-question … user|ai ["<reasoning>"]`). Each
   `AskUserQuestion` follows `plugin/references/question-style.md` — recommended
   option first (`(Recommended)`) + implication bullets in the text; work them out at
   ask-time if the question is terse. **0 open questions → skip this silently.**
   (Build's own autonomy is for EMERGENT build-time decisions only; pre-existing
   plan questions go through the walk.)

## Get the orchestration plan

```bash
anchored <tier> build <slug>      # → { stage, tier, node, steps }   (does NOT spawn)
```

`steps` is the resolved, config-driven plan. For a **looping tier** the plan carries
`each: <child-tier>` (plus `stop`, `retry_limit`) — that is the recursion edge you
drive below. For a **leaf phase** it is the worker pipeline
(`implement → task-validate → code-validate`). Each step has the shape
`{ name, instructions?, use?: { type: agent|skill, name }, execute?: sequential|workflow }`:
`use` names the worker to spawn, `instructions` is prose you read and follow (a
command lives HERE, as prose — there is no `run` step key), and `execute: workflow`
fans THAT single step out (see "Workflow mode" below).

## Drive the loop (task.build.each: phase / epic.build.each: task)

While `anchored task child-next <slug>` returns a child (else done):

1. **Mark the child in-flight** — the marker word is **tier-dependent** (the CLI
   rejects the wrong one with `InvalidChildStatus`):
   - **task → phase**: `anchored phase status <slug>/<phase> in-progress`
   - **epic → task**: `anchored epic child-status <slug> <task> active`
     (a task-stub is a loop-queue marker: `pending|active|done|blocked`, NOT the
     phase word `in-progress` — that mismatch bricked an epic in the dogfood).
2. **Per-child body:**
   - **task → phase** (leaf): `anchored phase build <slug>/<phase>` gives
     `[implement, task-validate, code-validate]`. Spawn **build-implement** via the
     Task tool with the agent-contract input `{ task-slug: <slug>, phase-slug:
     <child>, tier: phase, stage: build, context, rules }`. It writes code + a
     **build-NOTE per criterion** (`append-log … build note`) — it authors NO
     evidence. Then spawn the two checkers: **build-task-validate** is the EVIDENCE
     AUTHOR — it independently re-verifies each criterion and writes the proof
     (`anchored phase ac-evidence <slug>/<child> <ac-id> "<proof>"`, flips it done) or
     `ac-fail` (→ re-do); **build-code-validate** vetoes rule violations via `ac-fail`.
     Run task-validate THEN code-validate (code-validate may veto a just-evidenced
     criterion) — the checker records the proof, never the implementer (requirements-3).
   - **epic → task**: the child runs its OWN full just-in-time lifecycle, then the
     epic-child is marked delivered. Per ready child (the loop's body is the child's
     plan→refine→build→wrap, NOT a phase pipeline):
     1. **just-in-time plan** — `anchored task create <child-slug> "<title>"` then
        `anchored task plan <child-slug>` creates the child task-file.
        **Seed its decomposition from the stub's outcome acceptance criteria** (the Epic→Task
        contract epic-decompose wrote): read them
        (`anchored epic get <epic-slug>` → `tasks[].acceptance_criteria`) and pass
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
        `anchored epic child-status <epic-slug> <child> done`.
     The stub's outcome acceptance criteria are validated at the EPIC wrap (epic-roll-up,
     hard-with-reconcile), not here.
3. **Checkers + failures (the re-do loop):** build-task-validate AUTHORS the evidence
   for each criterion it confirms (`ac-evidence` → done) and REJECTS the rest
   (`anchored phase ac-fail <slug>/<phase> <ac-id> "<why>"` → `pending` with
   `failures`); build-code-validate rejects rule violations the same way. Read the
   child back (`anchored task get <slug>`); for each criterion carrying `failures`,
   re-spawn build-implement with those failures as the fix-list, then re-run the
   checkers. Retry up to `retry_limit` (default 3); on exhaustion → blocked.
4. **Advance:** when all the child's acceptance criteria are `done` (with evidence) and both
   checkers pass → `anchored phase status <slug>/<child> done`. This is the **only**
   place a phase reaches `done` — build-implement writes code + notes only and
   never flips the phase status (G4: that flip must come AFTER the checkers, never
   before, or the gates would inspect an already-`done` phase).
5. **Run the phase's trailing custom steps (commit, etc.)** — only now, on a green
   phase. See "Custom steps" below. A custom step whose command fails is a
   real failure: surface it and stop the loop (do not silently swallow a failed
   commit), it does not re-open the already-`done` phase.

## Custom steps (the config's own steps — commit, push, coverage …)

`anchored <tier> <stage> <slug>` returns the FULL config-driven plan, not just the
known workers. Every step has the uniform shape `{ name, instructions?, use?, execute? }`.
Besides the known-worker steps (a `use: { type: agent }` you spawn) and the recursion
edge (the looping tier's `each`), a custom step is one of:

- **An instructions-only step** — a step carrying `instructions:` but **no `use:`**,
  e.g. a per-phase `commit`, a `push`, a `coverage` gate. **YOU follow the prose and
  run any command it describes via Bash**, in declaration order, at the point it sits
  in the plan. The command lives **in the prose** — there is no `run` step key. For
  `phase.build` the trailing custom steps fire in step 5 above (after the gates +
  advance, on a green phase); a step positioned *before* a worker runs before that
  worker. The `instructions:` prose tells you the conditions, how to treat
  output/errors, and ordering hints.
- **A `use:` step** — spawn the named subagent (`use: { type: agent, name }`) or, with
  `use: { type: skill, name }`, invoke the skill, with the step's `instructions` + the
  same phase/task context the workers get.

**Variable contract (every command you run from an instructions step gets these as
environment variables).** The config author writes `${TASK_SLUG}` / `${PHASE_SLUG}`
etc. in the prose; you make them real env vars so the shell expands them — never
string-substitute by hand:

| Variable | Value | Available in |
|---|---|---|
| `TASK_SLUG` | the task-file being built (an epic child → the child's slug) | all build steps |
| `PHASE_SLUG` | the phase just built | `phase.build` steps |
| `PHASE_NAME` | the phase's plain-text name | `phase.build` steps |
| `EPIC_SLUG` | the parent epic slug, or empty when not in an epic | all build steps |

Run it as, e.g.:
```bash
TASK_SLUG='core-list' PHASE_SLUG='persistence' PHASE_NAME='Local persistence' EPIC_SLUG='' bash -c "$STEP_CMD"
```
where `$STEP_CMD` is the command the step's `instructions` prose names, verbatim.
**Per-phase commits don't
leak into chat** — narrate the phase outcome ("Phase 2 green, committed."), not the
git plumbing (see communication-style.md). Git is never the framework's concern: if
the user wants to capture a SHA into a field, their own custom step's command does it
(`anchored task set "${TASK_SLUG}" commit_sha "$(git rev-parse HEAD)"`).

> **Fan-out runs under git worktree isolation — directive, not caveat.** Every
> fan-out worker runs in its **own git worktree** — both the per-criterion **phase** fan-out
> (`execute: workflow`, below) and the **task-level** parallel fan-out (epic). A per-task
> branch (`task/<slug>`) assumes a single working tree, so N parallel workers
> `git switch`-ing one shared checkout would clobber each other; isolated worktrees
> never contend. This is what makes "fastest where safe" robust even against a wrong
> independence call — isolated worktrees merge cleanly, and the cross-process lock +
> compare-and-swap catch the rest. Worktree isolation is the **default for any
> fan-out**, not a fallback to a sequential loop.

## Epic task-level fan-out (parallel independent children, q8)

The loop above is sequential (one `next-child` at a time). For an **epic**, the
bigger speed lever is **task-level parallelism**: independent child-tasks at the
same dependency level (e.g. three comfort-features that all depend only on `core-list`)
have no reason to build one-after-another. When the runtime has the **Workflow
tool**, fan them out:

1. **Get the batch:** `anchored epic child-ready <epic-slug>` returns ALL
   currently-runnable children (pending + every dependency done) — the fan-out set,
   not just the first. If it has ≤1 entry, just run the sequential loop.
2. **Mark + dispatch:** set each batch child `active`, then dispatch them as a
   **Dynamic Workflow**, one unit per child, each unit running that child's FULL
   just-in-time lifecycle (plan→refine→build→wrap, the epic→task body above). Up to the
   hard ≤16 parallel ceiling; larger batches run in waves.
3. **Lock-safety:** each child writes its OWN task-file; the only shared surface is
   the epic's `tasks[]` status updates (`epic child-status`). The CLI's cross-process
   lock + validate-before-write (G1) serialize those safely — concurrent child
   status writes never corrupt the epic.
4. **Walk-questions are BUFFERED:** a child's refine walk can't prompt the user from
   a background unit. In a fan-out run, the child AI-resolves whatever the epic-wide
   question policy (H3) lets it, and **records any question the policy routes to the
   user on its task-file** (`task question-add`) instead of prompting — exactly like the
   phase-workflow buffering. At the **join**, the orchestrator reads each child's open
   questions and walks those buffered ones with the user (per the same policy), then
   continues.
5. **Join + advance:** when a unit's child task reaches `done`, mark its epic-child
   delivered (`epic child-status <epic-slug> <child> done`). Re-run `child-ready`
   for the next wave until the queue drains, then terminate as below.

Fall back to the sequential loop when the Workflow tool is unavailable (same
feature-detection + fallback contract as the phase-level fan-out). Phase-level
fan-out (`execute: workflow`, G12) and this task-level fan-out are independent levers that
compose: a workflow phase inside a workflow child-task.

## Emergent decisions → document or stop (the decision-trail)

build runs maximally autonomous, but **every emergent decision lands on the
record** — that is the core value ("every decision on the record"). The build-implement
worker self-reports decisions the plan didn't fully nail down (which library, which
error shape, extend-vs-replace) in its build-notes (`append-log <slug> build
learning "…"`). For EACH such decision, run the **stop-check**:

- **Does it match a `build.stop` rule?** (the `stop[]` array comes from `anchored
  <tier> build <slug>`; the shipped default is *"a decision deviates from the
  plan"*.) Judge the decision against those rules — a genuine plan/architecture
  deviation matches; a within-plan local call does not.
- **No match → proceed + document autonomously:** mint/resolve a question so the
  decision + its WHY are on the record (read by `/a:wrap`):
  ```bash
  anchored <tier> question-add <slug> "<the decision>" high          # → q<n>
  anchored <tier> question-resolve <slug> q<n> "<the decision>" ai "<why, the reasoning>"
  ```
  (`question-resolve` with `source=ai` REQUIRES the reasoning — the substrate
  rejects an AI decision with no recorded why.) Then keep building.
- **Match → STOP + escalate:** `anchored <tier> question-add <slug> "Build halted by
  stop-rule: <decision>" high`, surface it to the user, walk it
  (`question-resolve … user "<answer>"`), then continue. Minimise stops — proceed-
  and-document within-plan calls; stop only on a genuine deviation.

## Failure-handling (never silent — a5)

- **Agent returns nothing / errors** → treat as a failed acceptance criterion:
  record it as a `failures` entry and retry (counts toward `retry_limit`).
- **retry_limit exhausted** → mark the child blocked — tier-dependent: a phase →
  `anchored phase status <slug>/<child> blocked`; a task-stub →
  `anchored epic child-status <slug> <child> blocked`. Note what was tried in
  `anchored <tier> append-log <slug> build blocker
  "<phase> blocked after N attempts: <acceptance criteria>"`, then continue with the next child
  (the wrap reviewer surfaces blocked phases). Retry-exhaustion is a bounded
  mechanical limit, NOT a stop.
- **stop-condition** (a worker flags a decision matching a `build.stop` rule, e.g.
  *"a decision deviates from the plan"*) → **halt** the loop, record the decision
  `anchored <tier> append-log <slug> build decision "STOP: <decision>"`, surface it to
  the user, and walk it before continuing. Minimise stops — proceed-and-document
  within-plan calls; stop only on a genuine deviation.

## `execute: workflow` (fan-out) — the skill drives it via the Workflow tool

**Step-level fan-out is config, build-loop parallelism is not.** A single step may
carry `execute: sequential | workflow` (default `sequential`). `execute: workflow`
means **the SKILL fans THAT one step out** as a Dynamic Workflow instead of running it
once. That is the *only* config flag for parallelism — there is **no `mode:` on
`build`**. Running several phases (or several child-tasks) at once is the plugin's own
orchestration, NOT a config flag: ready children fan out and the dependency chain
sequences them — you discover the ready set via `anchored phase ready-phases <slug>` /
`anchored epic child-ready <epic-slug>` and the `depends_on` graph, then dispatch (see
"Epic task-level fan-out" above). The `each:` recursion edge stays intrinsic per tier.

When the `implement` step carries `execute: workflow` and the `Workflow` tool is
available, **the SKILL** fans the phase's acceptance criteria out as a Dynamic Workflow
— one parallel unit per not-yet-evidenced criterion (the engine's `loop-workflow.ts` is
a headless reference; the live fan-out lives here). The flow, sibling to the sequential
implement path:

1. **Plan the units.** Read the phase (`anchored task get <slug>`). A unit = one criterion
   with no build-note yet OR carrying `failures` (skip criteria that already have a build-note
   and no failures — resume-safety). ≤16 units in parallel; >16 → waves of 16.
2. **Dispatch (Workflow tool).** One `agent({ agentType: 'a:build-workflow',
   isolation: 'worktree', … })` per unit (the `build-workflow` plugin agent — the
   per-criterion fan-out worker), each in its **own git worktree** per the fan-out directive
   above, so parallel units never contend on one checkout. Each unit does its criterion's
   code and **self-writes a build-NOTE via the CLI** (`anchored task append-log … build note`)
   — like build-implement it authors **no** evidence. Background — emit one progress line,
   then return; the await is **re-invocation**, not polling.
3. **Collect (note-driven, resume-safe).** On re-engage, re-read the task-file; for each
   criterion: a build-note + no failures ⇒ its code is done, anything missing a note or
   carrying failures ⇒ re-dispatch ONLY that unit. No per-worker return to apply — the
   workers wrote to disk (do NOT double-apply).
4. **Checkers ONCE over the merged result — and they AUTHOR the evidence.** After the
   fan-out joins, spawn build-task-validate once over the whole phase: it independently
   re-verifies each criterion and writes the proof (`ac-evidence` → done) or rejects it
   (`ac-fail`); then build-code-validate vetoes rule violations. The checker records the
   evidence, never the unit-workers. Failures → the re-do loop (re-dispatch the rejected
   units), retry to `retry_limit`, stop-check unchanged.

**Hard precondition: `Bash(anchored *)` must be pre-approved on the allowlist** — a
background workflow has no interactive session, so an un-allowlisted `anchored` call
hangs. If the `Workflow` tool / `anchored:workflow` agent is unavailable, **fall back
to the sequential implement path** (never hard-error).

## Termination

When `child-next` returns null and at least one child is `done` (none
in-progress): `anchored <tier> status <slug> wrap`. Tell the user in plain words —
no status word, no `P/Q` codes: *"Build's done — P of Q finished (R still pending).
Next step: `/a:wrap`."* (drop the bracketed clause when nothing is blocked.)
No MCP, no raw node-file edit — every mutation goes through the `anchored` CLI.
