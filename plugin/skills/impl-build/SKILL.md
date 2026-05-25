---
name: impl-build
description: |
  Execute the implementation phase of an anchored task. Iterates
  through pending phases, runs the user's implement step + the fixed
  task-check and code-check quality gates per phase, transitions task
  status `build → wrap` when all phases reach terminal state.
  Resume-safe across crashes and compaction. Explicit-only trigger —
  user types `/impl-build` (optionally with a task slug).
---

# /impl-build

You are the orchestrator for the `/impl-build` lifecycle phase. The
user invoked you on a task whose status is `build`. Your job: loop
through its pending phases, drive each through the user's pipeline
+ anchored's fixed quality gates, end with the task ready for
`/impl-wrap`.

This skill is **explicit-only**. User typed `/impl-build` — proceed.

## Pre-flight

1. **Load `anchored.yml`** from project root. If missing, refuse with
   a hint: "No anchored.yml found. Run `/impl-plan` first to bootstrap
   this project."
2. **Resolve the task slug.**
   - If user passed a slug as argument, use it.
   - Otherwise, find the task-file the user most likely means:
     - If exactly one `.claude/tasks/<slug>.md` exists with
       `status: build`, use that.
     - Otherwise, list candidates and ask which.
3. **State gate.** Call `mcp__anchored__task_read(slug)`:
   - `status: plan` → refuse: "Task <slug> isn't refined yet (status:
     plan). Run `/impl-plan` first."
   - `status: build` → proceed.
   - `status: wrap` / `done` → refuse: "Task <slug> is past build
     stage. Run `/impl-wrap` or it's already done."

## Pipeline loop

While there's a phase whose status is `pending` OR `in-progress`:

```
phase = mcp__anchored__phase_next_pending(slug)
if phase is null: break
```

`phase_next_pending` returns the first phase in declaration order
that's in a non-terminal state. **In-progress phases come first** —
that's how resume-safety works (implement-agent's idempotent contract
picks up where it left off).

For each phase, do:

### 1. Mark in-progress
```
mcp__anchored__phase_status_set(slug, phase.slug, "in-progress")
```

### 2. Run user steps from anchored.yml.build.steps (in order)

For each user step (declaration order in anchored.yml):

- **`implement`** (or whatever name the user gave their primary
  worker): spawn the implement agent with:
  - TASK_SLUG, PHASE (full block including rules), TASK_CONTEXT
    (the task's ## Context + ### Plan content)
  - USER_INSTRUCTIONS: `anchored.yml.build.implement` prose
  - Capture return: `phase_done`, `evidences_set`, `touched_files`,
    `blockers`

- **Custom user steps** (e.g. `coverage`, `commit`): execute as
  prose-driven actions. The user wrote prose; you interpret it. If
  the prose says "run X command", do that. If it says "spawn Y
  agent", do that. Capture relevant outputs (especially
  `touched_files` updates if the step adds to them).

### 3. Always run task-check (fixed agent)

After all user steps for this phase:

Spawn `task-check` agent with:
- PHASE (slug, name, context, current ACs WITH evidences just filled)
- TASK_SLUG
- USER_EXTENSION: `anchored.yml.build.task_check` prose (appended to
  agent's defaults, may be empty)

Capture verdict + findings. Agent writes its audit to `### Build →
#### task-check` via MCP automatically.

### 4. Always run code-check (fixed agent)

Spawn `code-check` agent with:
- PHASE (slug, name, **rules**)
- TOUCHED_FILES from implement's output (accumulated across all user
  steps that produced touched_files)
- TASK_SLUG
- USER_EXTENSION: `anchored.yml.build.code_check` prose

Capture verdict + findings. Agent writes audit to `### Build →
#### code-check` via MCP.

### 5. Evaluate phase outcome

Look at:
- implement's `phase_done` + `blockers`
- task-check's `verdict`
- code-check's `verdict`
- AC completion: are ALL `evidence` fields non-empty? Call
  `mcp__anchored__ac_list(slug, phase.slug)` to check.

Then:

- **All non-empty + both checks pass (or warn)** →
  `phase_status_set(slug, phase.slug, "done")`
- **Any check returns `fail` (block-severity findings)** →
  `phase_status_set(slug, phase.slug, "blocked")` + write a one-line
  blocker note to `### Build → #### Implement` via context_append:
  ```
  - <phase-slug> / <phase-name>
    blocked: <which check failed and why, in one line>
  ```
- **AC evidence still missing (empty) without explicit block** →
  `phase_status_set(slug, phase.slug, "blocked")` with note:
  ```
  - <phase-slug> / <phase-name>
    blocked: N ACs without evidence — implement didn't complete
  ```
- **implement reported blockers explicitly** → `blocked`, with note
  citing the blocker reasons.

### 6. Loop

Pick next phase. Repeat.

## Termination

When `phase_next_pending` returns null:

1. Count phases by terminal state: `done`, `blocked`, `deferred`.
2. If at least one done + no in-progress remaining → transition task:
   `mcp__anchored__task_status_set(slug, "wrap")`.
3. Tell user:
   > "Build complete. P done / Q blocked / R deferred. Status: wrap.
   > Run `/impl-wrap` to finalize."

If ALL phases are blocked, still transition to wrap (so user can run
review + summarize on the partial work). The wrap step's TL;DR will
reflect that.

## Framework defaults (always run)

- Refuse to run if task status ≠ `build`.
- Pick next phase via `phase_next_pending` — handles in-progress
  resume automatically.
- Set phase status `pending → in-progress` at phase start.
- Route all evidence writes through `mcp__anchored__ac_evidence_set`
  (in implement agent via its prompt). Direct task-file edits
  forbidden.
- Capture step outcomes / blockers to `### Build` via `context_append`.
- **ALWAYS spawn `task-check`** after user steps — cannot disable.
- **ALWAYS spawn `code-check`** after user steps — cannot disable.
- Refuse to mark a phase `done` unless ALL `acceptance_criteria` have
  non-empty evidence.
- Loop until no phase has a non-terminal status.
- Transition task `build → wrap` when loop completes.

## Idempotency / resume contract

If `/impl-build` is run twice on the same task (e.g. after compaction
or a crash):

1. Pre-flight finds existing `status: build` → proceed.
2. `phase_next_pending` returns an `in-progress` phase if one exists
   — that's the one that didn't finish.
3. Spawn implement on it — implement's Step 0 reads the task-file,
   sees which ACs already have evidence, skips them.
4. Continue from there.

No special "resume" command needed. The state lives in the task-file;
the loop just keeps going.

## Manual reset escape hatch

If the user wants to restart a phase from scratch (after major
refactor, after context loss):

1. They edit the task-file directly: clear evidences (`evidence: —`)
   for ACs they want re-done, set the phase's `status` to `pending`.
2. They re-run `/impl-build`. Orchestrator sees pending phase, treats
   as fresh. implement does its full work.

File = single source of truth. No service-layer reset op needed in
V0.2.

## References on demand

- `references/task-file-schema.md`
- `references/evidence-format.md`
- `references/state-mutations.md`
