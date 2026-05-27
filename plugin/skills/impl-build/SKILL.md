---
name: impl-build
description: |
  Execute the implementation phase of an anchored task. Iterates
  through pending phases, runs the user's implement step + the fixed
  task-validate and code-validate quality gates per phase, drives the
  failures-driven re-do loop (bounded by anchored.yml.build.retry_limit),
  transitions task status `build → wrap` when all phases reach terminal
  state. Resume-safe across crashes and compaction. Explicit-only
  trigger — user types `/impl-build` (optionally with a task slug).
---

# /impl-build

## Communication style

See `plugin/references/communication-style.md` for the full principle —
partner voice in chat, machinery voice only in the audit trail and
verbose mode.

Skill-specific:

| Avoid (machinery voice) | Prefer (partner voice) |
|---|---|
| "Spawning implement-agent with PHASE payload..." | "Phase 2 (Token Storage Layer) angefangen." |
| "task-validate verdict=fail, rejected_count=2, RETRY_ATTEMPT=2 — re-spawning implement" | "Zwei ACs hängen noch — ich versuch's nochmal mit den findings als fix-liste." |
| "Retry limit (3) exceeded; calling set_phase_status('blocked')" | "Phase 2 ist nach 3 versuchen blocked — die ACs brauchen dein review." |

You are the orchestrator for the `/impl-build` lifecycle phase. The
user invoked you on a task whose status is `build`. Your job: loop
through its pending phases, drive each through the user's pipeline +
anchored's fixed quality gates, end with the task ready for
`/impl-wrap`.

This skill is **explicit-only**. User typed `/impl-build` — proceed.

## Pre-flight

1. **Load `anchored.yml`** from project root. If missing, refuse with
   a hint: "No anchored.yml found. Run `/impl-plan` first to bootstrap
   this project."
2. **Resolve the task slug.**
   - If the user passed a slug as argument, use it.
   - Otherwise, find the task-file the user most likely means:
     - If exactly one `.claude/tasks/<slug>.yml` exists with
       `status: build`, use that.
     - Otherwise, list candidates and ask which.
3. **State gate.** Call `mcp__task__read(project_root, slug)`:
   - `status: refined` → proceed (normal entry; most common path).
   - `status: build` → proceed (resume case; in-progress phases).
   - `status: drafted` → **shortcut entry with warning**. Plan hasn't
     been refined — plan-check + rules-check gates were skipped. For
     non-trivial tasks, refinement is strongly recommended. Issue
     this warning verbatim:

     > Plan hasn't been refined — plan-check + rules-check gates
     > were skipped. For non-trivial tasks, run `/impl-refine` first.

     Then ask via `AskUserQuestion`:

     > Proceed without refinement?
     >
     > Options:
     > - "Refine first (recommended)" — stop here; user runs
     >   `/impl-refine` then re-runs `/impl-build`.
     > - "Skip refinement" — transition `drafted → build` and
     >   proceed. The state-machine allows this; it's the documented
     >   shortcut.

     If the user picks **Refine first**: tell them
     "Run `/impl-refine` first, then re-run `/impl-build`." and exit
     cleanly. Do not flip status.

     If the user picks **Skip refinement**: call
     `mcp__task__set_task_status(project_root, slug, "build")` to
     transition `drafted → build`, then proceed with the pipeline
     loop.

   - `status: plan` → refuse: "Task `<slug>` isn't ready for build
     yet (status: plan). Run `/impl-plan` first."
   - `status: wrap` → refuse: "Task `<slug>` is past build stage
     (status: wrap). Run `/impl-wrap` to finalize."
   - `status: done` → refuse: "Task `<slug>` is already done."

## Pipeline loop

While there's a phase whose status is `pending` OR `in-progress`:

```
phase = mcp__task__next_phase(project_root, slug)
if phase is null: break
```

`task__next_phase` returns the first phase in declaration order that's
in a non-terminal state, with `in-progress` taking priority over
`pending` (for resume-safety — implement-agent's idempotent contract
picks up where a prior run left off).

For each phase, do:

### 1. Mark in-progress

```
mcp__task__set_phase_status(project_root, slug, phase.slug, "in-progress")
```

(No-op if status is already `in-progress` from a resume.)

### 2. Run user steps from anchored.yml.build.steps (in order)

For each user step (declaration order in anchored.yml):

- **`implement`** (or whatever name the user gave their primary
  worker): spawn the `implement` agent with:
  - PROJECT_ROOT, TASK_SLUG, PHASE (full block including rules + AC
    statuses + any `failures` fields), TASK_CONTEXT (context.intro +
    context.plan)
  - RETRY_ATTEMPT: current `phase.retry_count + 1` (1 on first pass,
    incremented for each re-spawn)
  - USER_INSTRUCTIONS: `anchored.yml.build.implement` prose
  - Capture return: `phase_done`, `evidences_set`, `retry_attempt`,
    `failures_addressed`, `touched_files`, `blockers`

- **Custom user steps** (e.g. `coverage`, `commit`): execute as
  prose-driven actions. The user wrote prose; you interpret it. If
  the prose says "run X command", do that. If it says "spawn Y
  agent", do that. Capture relevant outputs (especially
  `touched_files` updates if the step adds to them).

### 3. Always run task-validate + code-validate (in PARALLEL)

After all user steps for this phase, spawn `task-validate`
(`plugin/agents/task-validate.md`) AND `code-validate`
(`plugin/agents/code-validate.md`) **in parallel** — issue both
`Task` tool calls in a single message. The two agents are
independent (task-validate scrutinizes evidence-vs-AC; code-validate
scrutinizes code-vs-rules) and reading the same task-file
concurrently is safe.

**Why parallel:** these are the slowest steps in the per-phase loop
(LLM-reasoning-bound). Running them concurrently halves wall-clock
without sacrificing safety. The cross-process lock in
`core/io.ts:atomicWrite` serializes their writes — if both happen
to call `set_failures` on overlapping ACs in the same millisecond,
neither write is torn; the later write wins for that specific AC.
In practice the two validators reject ACs for different reasons and
overlap is rare.

**task-validate inputs:**
- PROJECT_ROOT, TASK_SLUG, PHASE (slug, name, context, current ACs)
- RETRY_ATTEMPT: same value passed to implement
- USER_EXTENSION: `anchored.yml.build.task_validate` prose (appended
  to agent's defaults, may be empty)

**code-validate inputs:**
- PROJECT_ROOT, TASK_SLUG, PHASE (slug, name, **rules**, acceptance_criteria)
- TOUCHED_FILES from implement's output (accumulated across all user
  steps that produced touched_files)
- RETRY_ATTEMPT: same value
- USER_EXTENSION: `anchored.yml.build.code_validate` prose

Each agent writes its rollup to `context.build → <validator-name>`
via `mcp__task__append_build_section` and per-AC failures via
`mcp__task__set_failures` for each rejection (which atomically flips
the AC back to `pending` and keeps its evidence as history).

Capture both verdicts + rejected_acs once both `Task` calls return.

### 4. Failures-driven re-do loop (autonomy-aware)

After task-validate + code-validate complete:

1. Re-read the phase via `mcp__task__read(project_root, slug)`.
2. Scan `phase.acceptance_criteria`; collect ACs whose `failures`
   field is present and non-empty.
3. **Check for new mid-build questions.** task-validate +
   code-validate MAY surface new questions during build (e.g. they
   discovered an ambiguity in implementing the ACs that the plan
   didn't anticipate). Mid-build questions are tagged `priority: high`
   regardless of autonomy — implementation ambiguity is unexpected
   by definition.

   ```
   const newQuestions = await mcp__task__question_list(
     project_root, slug,
     filter: { status: 'open' }
   )
   ```

   **If any new open questions exist**: halt the phase loop, walk
   the questions with the user via `AskUserQuestion` (build-time
   ambiguity always asks the user, even under `decide_all` — the
   contract is "AI decides what the PLAN couldn't predict ahead of
   time, not what task-validate caught mid-execution"). Resolve
   each via `task__question_resolve` with `source='user'`. After
   resolution, re-spawn implement for the phase. Loop back to
   step 3 (validators rerun).

4. **If failures present**, read the task's autonomy level to
   decide retry behavior:

   ```
   const file = await mcp__task__read(project_root, slug)
   const autonomy = file.autonomy ?? 'ask_high_only'   // safe default
   ```

   Then branch:

   **a. `autonomy === 'ask_all'` — block on first failure**

   No silent retry. The user wanted to be in the loop on every
   decision; that includes failure recovery. Call
   `set_phase_status('blocked')` and surface the failures + the
   accumulated `failures[]` strings to the user via AskUserQuestion:

   > "Phase {phase.name} ist in {N} ACs hängengeblieben. Soll ich
   > nochmal mit den failure-notes ran, oder willst du erstmal
   > selber gucken?"
   >
   > Options:
   > - "Retry mit den failures als input" (resume the retry path)
   > - "Ich gucke mir das erstmal an" (halt + exit; user can run
   >   `/impl-build` again to resume after manual fix)
   > - "Skip + continue mit nächster phase" (leave phase blocked,
   >   call `next_phase`, continue)

   **b. `autonomy === 'ask_high_only'` — retry then block + ask**

   Standard V0.2 behavior. Call
   `mcp__task__increment_retry(project_root, slug, phase.slug)`
   → returns new `retry_count` as `N`.

   - **If `N > retry_limit`** (default 3): `set_phase_status('blocked')`,
     ask the user (same AskUserQuestion as case a) what to do next.
   - **If `N ≤ retry_limit`**: re-spawn implement with
     RETRY_ATTEMPT = `N + 1`, re-run validators, loop back to step 3.

   **c. `autonomy === 'decide_all'` — retry then mark blocked + continue**

   Vibe-coder hands-off mode. Same retry path as case b, but on
   exhaustion the orchestrator does NOT ask the user — it marks
   the phase blocked, logs the accumulated failures to
   `context.build`, and continues to the next phase via
   `next_phase`. The /impl-wrap reviewer surfaces the blocked
   phases for human attention later.

   Specifically:
   - `mcp__task__increment_retry` → `N`
   - **If `N > retry_limit`**: `set_phase_status('blocked')`, append
     a summary note to `context.build → Implement` describing what
     was tried + which ACs hit the wall, then call `next_phase`
     and continue.
   - **If `N ≤ retry_limit`**: re-spawn implement as usual.

5. **If no failures present** (all ACs accepted by both validators):
   - Continue to step 5 (phase outcome evaluation).

The orchestrator owns retry accounting + autonomy interpretation.
The agents (implement, task-validate, code-validate) never call
`increment_retry` themselves and never read `task.autonomy` — they
operate the same regardless. Keep those decisions at the orchestrator
layer.

**Autonomy override mid-build.** If the user says during a Q&A walk
or at a block-and-ask prompt "actually, switch to decide_all" (or
similar), call `mcp__task__set_autonomy` with the new value before
continuing. The op appends an override audit entry; subsequent
failure-handling reads the new value.

### 5. Evaluate phase outcome

Look at:
- implement's `phase_done` + `blockers`
- task-validate's `verdict`
- code-validate's `verdict`
- AC completion: are ALL ACs `status: 'done'`? Call
  `mcp__task__read(project_root, slug)` and check each
  `acceptance_criteria[i].status`.

Then:

- **All ACs `done` + both validators `pass`** →
  `mcp__task__set_phase_status(project_root, slug, phase.slug, "done")`.
- **Retry limit exhausted** (handled in step 4c — phase already
  `blocked`).
- **implement reported a non-recoverable blocker** (e.g. missing
  external dependency the orchestrator can't fix) →
  `set_phase_status("blocked")` + append a one-line note to
  `context.build → Implement` via `append_build_section`.

### 6. Loop

Pick next phase via `mcp__task__next_phase`. Repeat.

## Termination

When `task__next_phase` returns null:

1. Count phases by terminal state: `done`, `blocked`, `deferred`.
2. If at least one phase is `done` AND no phase is in-progress →
   transition task: `mcp__task__set_task_status(project_root, slug, "wrap")`.
3. Tell the user:
   > "Build complete. P done / Q blocked / R deferred. Status: wrap.
   > Run `/impl-wrap` to finalize."

If ALL phases are blocked, still transition to wrap (so the user can
run review + summarize on the partial work). The wrap step's TL;DR
will reflect that.

## Framework defaults (always run)

- Refuse to run if task status is `plan`, `wrap`, or `done`.
- Accept `refined` (normal entry) and `build` (resume) directly.
- Accept `drafted` only via the documented shortcut: warn + confirm
  with the user, then transition `drafted → build` before proceeding.
- Pick next phase via `task__next_phase` — handles in-progress resume
  automatically.
- Set phase status `pending → in-progress` at phase start.
- Route all evidence writes through `mcp__task__set_evidence` (in
  the implement agent via its prompt). Direct task-file edits are
  forbidden — no agent has Write or Edit anyway (V0.2 retired all
  bootstrap exceptions).
- Capture step outcomes / blockers to `context.build` via
  `append_build_section`.
- **ALWAYS spawn `task-validate`** after user steps — cannot disable.
- **ALWAYS spawn `code-validate`** after user steps — cannot disable.
- **ALWAYS drive the failures-driven re-do loop** until either every
  AC is accepted or the retry limit is exhausted (phase → blocked).
- Refuse to mark a phase `done` unless ALL ACs have `status: 'done'`
  (the factory's `set_phase_status('done')` enforces this; you don't
  need to check separately).
- Loop until no phase has a non-terminal status.
- Transition task `build → wrap` when loop completes.

## Idempotency / resume contract

If `/impl-build` is run twice on the same task (e.g. after compaction
or a crash):

1. Pre-flight finds existing `status: build` → proceed.
2. `task__next_phase` returns an `in-progress` phase if one exists
   — that's the phase that didn't finish.
3. Spawn implement on it — implement's Step 0 re-reads via
   `mcp__task__read`, sees which ACs already have status='done',
   skips them; sees ACs with `failures`, treats those as the re-do
   pathway.
4. Continue from there.

No special "resume" command needed. The state lives in the task-file;
the loop just keeps going. The `retry_count` field persists across
runs — a phase that's already been retried twice picks up the count.

## Manual reset escape hatch

If the user wants to restart a phase from scratch (after major
refactor, after context loss):

```bash
# Reset every AC in a phase to pending (clears evidence + failures atomically)
for i in 0 1 2; do anchored ac status set <slug> <phase-slug> $i pending; done
# Reset the phase status back to pending
anchored phase status set <slug> <phase-slug> pending
```

Then re-run `/impl-build`. Orchestrator sees pending phase, treats as
fresh. implement does its full work.

For full task reset (rare): edit the task-file's `retry_count` keys
to 0 (the parser passes through unknown fields; the factory's
`increment_retry` will pick up from 0 next time).

## References on demand

- `references/task-file-schema.md`
- `references/state-mutations.md`
