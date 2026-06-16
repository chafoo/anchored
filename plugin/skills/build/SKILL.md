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
| "child status … in-progress" | "Started phase 2 (Persistence)." |
| "core-list runs its just-in-time lifecycle plan→refine→build→wrap" | "I'll build core-list first — from planning to done." |
| "task-validate verdict=fail, rejected_count=2" | "Two acceptance criteria still pending — I'll retry with the findings as a fix-list." |
| "flip to wrap / next-child → null" | "Build's done — all phases green. Review's up next." |

**Before every user-facing line**, apply the jargon mapping from
`communication-style.md` — framework terms (scaffold, stub, seam, grounding,
roll-up, outcome acceptance criteria, execute, the each-loop, drafted/refined,
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
   shortcut), clear them BEFORE the long run using the SAME threshold choice as
   `/a:refine` (`high` (default) / `medium` / `low` / `ai`) — `AskUserQuestion`
   first, then resolve each (`<tier> question resolve <slug> <id> user|ai ["<reasoning>"]`). Each
   `AskUserQuestion` follows `plugin/references/question-style.md` — recommended
   option first (`(Recommended)`) + implication bullets in the text; work them out at
   ask-time if the question is terse. **0 open questions → skip this silently.**
   (Build's own autonomy is for EMERGENT build-time decisions only; pre-existing
   plan questions go through the walk.)
4. **Escalation policy (the standing pull-me-in rule for the whole run).** The build
   runs maximally autonomous, but the user defines — in their own words — *when*
   anchored should pull them in mid-build. Read it from working memory:
   - **Captured in refine** (`/a:refine` asks it once, as typed prose). For an
     **epic** the policy was set once and governs the **whole epic build, every child
     included** — do NOT re-ask when the build just-in-time refines each child. For a
     standalone **task** it was captured at its refine.
   - **Fallback — refine was skipped** (`drafted → build`, no policy in memory): ask
     it ONCE here, as **typed free-form prose, not a menu** —
     > "When do you want me to pull you in during the build? Default: just the
     > important calls. Or: all of them · none, you decide · or name topics, e.g.
     > 'anything touching persistence or auth'."

     The lazy path is accepting the suggested default. The old priority words
     (important / all / none / topics) survive only as **example phrasings in the
     prompt**, never a pick-list — this one is prose by design (the node's concrete
     plan questions stay selection-based; this open "when else reach me" is typed).
     Hold the answer in working memory for the run (ephemeral, revisable mid-flight).
   - Judge every build-time escalation moment against this policy — see **"Build-time
     escalation"** below. This is best-effort help, not a hard guarantee; the hard
     guarantees live in the substrate (evidence, acceptance criteria).

## Get the orchestration plan

```bash
anchored <tier> build <slug>      # → { stage, tier, node, steps }   (does NOT spawn)
```

`steps` is the resolved, config-driven plan. For a **looping tier** the plan carries
`each: <child-tier>` (plus `stop`, `retry_limit`) — that is the recursion edge you
drive below; `execute: workflow` on the `each` step is what fans the loop's ready
children out in parallel (see "Fan-out" below). For a **leaf phase** it is the worker
pipeline (`implement → task-validate → code-validate`). Each step has the shape
`{ name, instructions?, use?: { type: agent|skill, name }, execute?: sequential|workflow, with?: <step-name> }`:
`use` names the worker to spawn, `instructions` is prose you read and follow (a
command lives HERE, as prose — there is no `run` step key), `execute: workflow` on
the loop step fans its ready children out (see "Fan-out"), and **`with: <step-name>`
marks this step as part of a parallel batch with the named sibling** (see "Parallel
batches (`with:`)" below — you read it from the plan, never hardcode the pairing).

## Drive the loop (task.build.each: phase / epic.build.each: task)

While the parent yields a next child — `anchored task phase next <slug>` (task→phase)
or `anchored epic child next <slug>` (epic→task) — returns one (else done):

1. **Mark the child in-flight** — the marker word is **tier-dependent** (the CLI
   rejects the wrong one with `InvalidChildStatus`):
   - **task → phase**: `anchored phase status <slug>/<phase> in-progress`
   - **epic → task**: `anchored epic child status <slug> <task> active`
     (a task-stub is a loop-queue marker: `pending|active|done|blocked`, NOT the
     phase word `in-progress` — that mismatch bricked an epic in the dogfood).
2. **Per-child body:**
   - **task → phase** (leaf): the leaf pipeline `[implement, task-validate,
     code-validate]` comes from the `task build <slug>` plan (the worker steps under
     `each: phase`) — the phase has no own build verb. Spawn **build-implement** via the
     Task tool with the agent-contract input `{ task-slug: <slug>, phase-slug:
     <child>, tier: phase, stage: build, context, rules }`. It writes code + a
     **build-NOTE per criterion** (`task log add <slug> <at> build note`) — it authors NO
     evidence. Then run the two checkers: **build-task-validate** is the EVIDENCE
     AUTHOR — it independently re-verifies each criterion and writes the proof
     (`anchored phase ac evidence <slug>/<child> <ac-id> "<proof>"`, flips it done) or
     `ac fail` (→ re-do); **build-code-validate** vetoes rule violations via `ac fail`.
     **The two gates run as a parallel batch** — the `code-validate` step carries
     `with: task-validate` in the plan, so you spawn both **in one message, two
     agents** (you learn the pairing from the plan's `with:`, never hardcode it — see
     "Parallel batches (`with:`)"). The split stays (evidence-author vs. rule-veto keeps
     the author honest); they run together because they already could. code-validate
     may veto a criterion task-validate just evidenced — the checker records the proof,
     never the implementer (requirements-3).
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
        `refined`. Apply the **task question policy** from the epic-refine (working
        memory — the `task` half, SEPARATE from the epic's own policy):
        - **`epic-wide`** → route each child question by the remembered threshold
          (`high`/`medium`/`low`/`ai` — at-or-above goes to the user, the rest you
          decide with reasoning). Do **not** re-ask per child.
        - **`jit`** → ask the threshold **fresh for THIS task** (the same high/medium/
          low/ai choice as a normal task-refine walk), then route by it.
        - **`conditions`** → judge each question against the user's words ("does this
          touch what they asked to be involved in?"): a match → the user, the rest you
          resolve with reasoning.
        If you reach the build with NO remembered task policy (fresh session, or
        epic-refine was skipped), ask it once now (epic-wide vs. jit + threshold) —
        see refine SKILL "Question policy — the epic and the tasks are SEPARATE".
     3. **Build the child** — recurse THIS loop on the child task (`each: phase`).
     4. **Wrap the child** (review + summarize) → child task `done`. When the child ran
        **sequentially in the main tree**, it owns its **own branch + merge-back via
        its own wrap** and you do nothing extra. When it ran in an **isolated
        worktree** (the parallel fan-out path), its wrap cannot merge onto the
        integration branch from inside the worktree — so the **branch merge-back is
        yours at the join**, serial and conflict-aware (see
        `plugin/references/workflows.md`). Either way you **never hand-consolidate a
        diff** — a merge-back is `git merge` of a clean branch, not a manual splice.
     5. Mark the epic-child delivered:
        `anchored epic child status <epic-slug> <child> done`. **All-phases-done is
        enough** — the core delivers the child on every phase terminal; do NOT
        evidence the stub's outcome acceptance criteria here first (B1: that build-time
        re-evidencing layer is gone). The stub's outcome acceptance criteria are
        verified ONCE, at the EPIC wrap (epic-roll-up is the authoritative
        definition-of-done check against the built code), never per-task at build.
3. **Checkers + failures (the re-do loop):** build-task-validate AUTHORS the evidence
   for each criterion it confirms (`ac evidence` → done) and REJECTS the rest
   (`anchored phase ac fail <slug>/<phase> <ac-id> "<why>"` → `pending` with
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

## Fan-out — the loop step fans out ready children (A2/A3)

**Fan-out lives on the loop step, not on acceptance criteria.** Only a unit that
**owns its own deliverable boundary** is fanned out — a task (owns `task/<slug>` →
main via its own wrap) and a phase (owns its own WORK + build-notes; its per-phase
commit, if any, comes from the orchestrator's trailing `commit` custom step on a
green phase — the phase worker makes no commit itself). An acceptance
criterion owns no such boundary, so **acceptance criteria are NEVER fanned out** — that is
exactly the per-criterion worktree fan-out that broke in the dogfood (the workers
never merged back, the criteria collided on the same file region). It is **dropped
entirely**. The fan-out is driven by the loop step's `execute: workflow` (read from
the `task build` / `epic build` plan) plus each child's `depends_on` (read from the
node) — no ad-hoc worktree join, no manual diff consolidation by the orchestrator.
**Two senses of "join" — keep them apart:** the **synchronization join is KEPT** — a
barrier where the ready units rejoin (the buffered-question walk, the **branch
merge-back of any worktree-isolated unit**, and the gate batch all run there); only
the **diff-consolidation join is DROPPED** — the orchestrator never merges file
contents by hand. A worktree-isolated unit's clean branch is still reunited at the
join with a real `git merge` (the orchestrator's job, because an isolated worktree
can't merge onto the integration branch itself) — that is the KEPT branch merge-back,
not the dropped hand-splice. **Worktree isolation for any fan-out whose units may
write the same file region is a directive, not caveat** — it is how parallel writes
stay collision-free; the serial merge-back that follows is governed by
`plugin/references/workflows.md`.

**Both looping tiers fan out the same way:**
- **epic → tasks:** ready child-tasks fan out in parallel; each runs its OWN full
  just-in-time lifecycle (plan→refine→build→wrap, the epic→task body above) and
  **owns its branch + merge-back via its own wrap**.
- **task → phases:** ready phases fan out in parallel; each is the leaf pipeline
  (implement → the gate batch → advance) and **owns its own WORK + build-notes**; the
  per-phase commit, if any, comes from the orchestrator's trailing `commit` custom step
  on a green phase (the phase worker makes no commit itself).

Run the fan-out when the loop step carries `execute: workflow` AND the **Workflow
tool** is available; otherwise fall back to the sequential loop above (never
hard-error). The flow:

1. **Get the ready batch (by `depends_on`).** `anchored epic child ready <slug>`
   (epic) / `anchored task phase ready <slug>` (task) returns ALL currently-runnable
   children — every child whose dependencies (`depends_on`, read from the node) are
   done, not just the first. ≤1 entry → just run the sequential loop. The dependency
   chain sequences the rest across waves.
2. **Mark + dispatch.** Mark each batch child in-flight (epic: `epic child status
   <slug> <child> active` · task: `phase status <slug>/<phase> in-progress`), then
   dispatch them as a **Dynamic Workflow** — one unit per child:
   - an **epic** unit runs the child task's FULL just-in-time lifecycle (the epic→task
     body above) and owns its `task/<slug>` branch + merge-back via its own wrap;
   - a **task** unit builds ONE phase — dispatch `agent({ agentType:
     'a:build-workflow', … })` (the `build-workflow` plugin agent does the phase's code
     + self-writes a build-note per criterion, authoring NO evidence and making NO
     commit); the phase's per-phase commit, if any, comes from the orchestrator's
     trailing `commit` custom step on a green phase.

   A task unit owns its work on its own branch; a phase unit owns its WORK +
   build-notes. The orchestrator never hand-consolidates a **diff** (the
   **diff-consolidation join is DROPPED**) — but it DOES own the **branch merge-back**
   of every worktree-isolated unit at the synchronization join (a real `git merge`,
   serial, conflict-aware — `plugin/references/workflows.md`), because an isolated
   worktree cannot merge onto the integration branch itself. Up to the hard ≤16
   parallel ceiling; larger batches run in waves. After a task-fan-out batch joins,
   run the gate batch ONCE over the **merged** result (see "Parallel batches") — the
   checkers author the evidence over what actually landed, never the unit-workers.
3. **Lock-safety.** Each child writes its OWN file (a task its task-file; a phase its
   region under the task). The only shared surface is the parent's child-status
   updates; the CLI's cross-process lock + validate-before-write serialize those
   safely — concurrent status writes never corrupt the parent.
4. **Walk-questions are BUFFERED.** A child's refine walk can't prompt the user from a
   background unit. The child AI-resolves whatever the epic-wide question policy lets
   it and **records any question the policy routes to the user on its task-file**
   (`task question add`) instead of prompting. At the **join**, read each child's open
   questions and walk those buffered ones with the user (per the same policy +
   escalation policy), then continue.
5. **Join → merge-back → advance.** When a unit reaches its terminal (a task `done`, a
   phase all acceptance criteria evidenced + the authoritative gates green — those
   gates are `build-task-validate` / `build-code-validate`, run ONCE over the **merged**
   result at this join, NOT the worker's own pre-handoff self-check): first **reunite
   any worktree-isolated branch** — serially, with the project's configured merge,
   resolving shared-file conflicts from both finished sides, then clean up the branch +
   worktree (full contract: `plugin/references/workflows.md`). Then advance the parent:
   epic → `epic child status <slug> <child> done` (B1: all-phases-done delivers — no
   outcome-AC re-evidencing here); task → `phase status <slug>/<phase> done` then the
   phase's trailing custom steps. Re-run the ready verb for the next wave until the
   queue drains, then terminate as below.

## Build-time escalation → document or pull the user in (the decision-trail)

build runs maximally autonomous, but **every emergent decision lands on the
record** — that is the core value ("every decision on the record"). The build-implement
worker self-reports decisions the plan didn't fully nail down (which library, which
error shape, extend-vs-replace) in its build-notes (`<tier> log add <slug> <at> build
learning "…"`). At **every escalation moment** — a decision the orchestrator is about
to make autonomously, OR an action about to run — judge it against **three** filters,
and escalate (pull the user in) on a match with ANY:

- **(a) The user's escalation policy** (captured in refine / the pre-build walk, held
  in working memory — see Pre-flight 4). Does this moment match what the user asked to
  be pulled in on? (their topics / "the important calls" / "all of them" / etc.)
- **(b) The safety reflex** (one-liner, always on, regardless of the user's stated
  policy): **surface anything irreversible / high-blast-radius** — destroying data,
  rewriting history, breaking a contract/schema, anything you couldn't cleanly undo.
  This covers the unknown-unknowns the user didn't think to name. Best-effort review,
  not a coded heuristic — it rides your normal judgement.
- **(c) A `build.stop` rule** (the `stop[]` array from `anchored <tier> build <slug>`;
  the shipped default is *"a decision deviates from the plan"*). A genuine
  plan/architecture deviation matches; a within-plan local call does not.

**No match on any → proceed + document autonomously:** mint/resolve a question so the
decision + its WHY are on the record (read by `/a:wrap`):
```bash
anchored <tier> question add <slug> "<the decision>" high          # → q<n>
anchored <tier> question resolve <slug> q<n> "<the decision>" ai "<why, the reasoning>"
```
(`question resolve` with `source=ai` REQUIRES the reasoning — the substrate
rejects an AI decision with no recorded why.) Then keep building.

**Match on any → STOP + escalate:** `anchored <tier> question add <slug> "<the
decision / what triggered the escalation>" high`, surface it to the user (phrased per
`plugin/references/question-style.md` — recommendation + implications), walk it
(`question resolve … user "<answer>"`), then continue. Minimise stops — proceed-
and-document for everything that matches none of (a)/(b)/(c); escalate only on a real
match.

## Failure-handling (never silent — a5)

- **Agent returns nothing / errors** → treat as a failed acceptance criterion:
  record it as a `failures` entry and retry (counts toward `retry_limit`).
- **retry_limit exhausted** → mark the child blocked — tier-dependent: a phase →
  `anchored phase status <slug>/<child> blocked`; a task-stub →
  `anchored epic child status <slug> <child> blocked`. Note what was tried in
  `anchored <tier> log add <slug> <at> build blocker
  "<phase> blocked after N attempts: <acceptance criteria>"`, then continue with the next child
  (the wrap reviewer surfaces blocked phases). Retry-exhaustion is a bounded
  mechanical limit, NOT a stop.
- **escalation match** (a worker flags a decision matching a `build.stop` rule, the
  user's escalation policy, or the safety reflex — see "Build-time escalation") →
  **halt** the loop, record the decision
  `anchored <tier> log add <slug> <at> build decision "STOP: <decision>"`, surface it to
  the user, and walk it before continuing. Minimise stops — proceed-and-document
  everything that matches none of the three filters; escalate only on a real match.

## Parallel batches (`with:`) — read the marker, don't hardcode the pairing

A stage's steps run **sequentially** in declaration order — except where the config
marks a **parallel batch** with `with: <step-name>`. A step carrying `with: <anchor>`
runs in the **same parallel batch** as the named anchor step; the batch joins before
the next sequential step. You **learn the batch from the plan**, never hardcode which
steps pair:

- **Read `with:` off each step in the plan** (`anchored task build <slug>` → `steps`).
  Steps chained by `with:` form one batch — spawn them **all in one message** (one
  message, N agents), wait for the whole batch to join, then move on to the next
  sequential step.
- **The built-in gates ride this.** The default template ships the two phase gates as
  a `with:` batch — `code-validate` carries `with: task-validate` — so they spawn **in
  parallel by default**, declaratively, **not** because the skill hardcodes the
  pairing. (Earlier the skill hardcoded "task-validate then code-validate"; now the
  pairing is data. The order *within* the batch still matters for the evidence
  inversion — task-validate authors evidence, code-validate may veto it — but they
  spawn together and the result is read after both land.)
- **Users get the same lever** — any custom steps the config chains with `with:` (e.g.
  `lint` + `typecheck` + `test`) spawn as one parallel batch.

`with:` (parallel *sibling* steps) is a different axis from `execute: workflow`
(one loop step fanning out its ready *children* — see "Fan-out"). One runs two
sibling steps together; the other fans a single step's children out.

**Hard precondition for any fan-out / parallel batch: `Bash(anchored *)` must be
pre-approved on the allowlist** — a background unit has no interactive session, so an
un-allowlisted `anchored` call hangs. If the `Workflow` tool is unavailable, **run the
batch sequentially** (gates still both run, just not in parallel) and **fall back to
the sequential loop** for fan-out (never hard-error).

## Termination

When the next-child verb (`task phase next` / `epic child next`) returns null and at
least one child is `done` (none in-progress): `anchored <tier> status <slug> wrap`. Tell the user in plain words —
no status word, no `P/Q` codes: *"Build's done — P of Q finished (R still pending).
Next step: `/a:wrap`."* (drop the bracketed clause when nothing is blocked.)
No MCP, no raw node-file edit — every mutation goes through the `anchored` CLI.
