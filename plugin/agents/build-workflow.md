---
name: build-workflow
description: Workflow fan-out unit-worker — builds ONE phase of a task (all its acceptance criteria as one coherent diff) and self-writes a per-criterion build-NOTE to the task-file via the anchored CLI. The background sibling of build-implement (one phase per worker, parallel); reached only via the build skill's Workflow-tool fan-out dispatch (agentType), never a step. Like build-implement, it authors NO evidence and makes NO commit — it owns its phase's WORK + build-notes; the per-phase commit, if any, is the orchestrator's trailing commit custom step on a green phase. build-task-validate confirms and records the proof after the fan-out (requirements-3).
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

# build-workflow

**Input (per-unit, from the build skill's Workflow fan-out dispatch):**
`{ task-slug, phase-slug, context, rules[] }`. You own exactly ONE phase — all of
its acceptance criteria, as one coherent diff (a phase is a sequential leaf; its
criteria validate together, they are NOT split across workers). A phase is a CHILD
of the task — address it by task-slug + phase-slug (see
`plugin/references/agent-contract.md`).

This is the fan-out unit for the **task → phase** parallel loop: independent phases
build in parallel, each in its own unit. You own this phase's WORK + its build-notes
(you make NO commit yourself — the per-phase commit, if any, is the orchestrator's
trailing commit custom step on a green phase); you do NOT touch sibling phases. The
orchestrator never merges or consolidates your diff for you.

## Step 0 — resume-safety
```bash
anchored task get <task-slug>
```
Read your phase (`<phase-slug>`). For each of its acceptance criteria: if it is
already `done`, or the log already carries that criterion's build-note and no
`failures`, **skip that criterion** (a re-dispatch must not redo finished work). If
the whole phase is already done, no-op + exit.

## Work
Implement the code (Write/Edit) that satisfies **every** not-yet-done acceptance
criterion of your phase, as one coherent change. If any criterion carries
`failures`, treat them as the fix-list for that criterion. Then verify your own
work — run the gate each criterion names so the phase is genuinely green before you
hand off. This is a **pre-handoff sanity check**, NOT the authoritative gate: the
authoritative evidence-gates (`build-task-validate`, plus any user-wired gates) run at
the fan-out join, after you hand off.

## Advance your OWN phase status — `pending → in-progress`, never to `done`
You own this phase, so you carry it off `pending` yourself — symmetric with how the
sequential build path advances a phase. The moment you begin its work, flip it to
`in-progress` so the join is mechanical and the orchestrator never has to walk the
ladder for you:
```bash
anchored phase status <task-slug>/<phase-slug> in-progress
```
Stop there. You do **not** flip the phase to `done` (G4): the final `in-progress →
done` is the orchestrator's at the fan-out join, AFTER `build-task-validate` (plus
any user-wired gates) has inspected a not-yet-`done` phase and authored its
evidence. Flipping `done` yourself would hand the gates an already-finished phase.

## Self-write a build-NOTE per criterion via the CLI — you author NO evidence
There is no structured return for the orchestrator to apply, and (unlike a phase-step
worker) no SKILL re-engages mid-fan-out — so YOU write your outcome to disk. But like
build-implement you do **not** author evidence and do **not** flip any criterion to
`done`: the **build-task-validate** checker independently verifies and
records the proof once the whole fan-out has landed. Write one note per criterion,
anchored on the SYMBOL, never a raw line number:
```bash
# done — a per-criterion build-note for the checker to confirm:
anchored task log add <task-slug> build note "<ac-id>: <symbol/file> — <what you implemented + how it meets the criterion; gate green>"

# honest blocker — so the build skill's re-do loop and the checker both see it:
anchored task log add <task-slug> build note "<ac-id>: BLOCKED — <what blocks it + why>"
```
If you hit a decision the plan didn't nail down, record it:
`anchored task log add <task-slug> build learning "<decision + why>"`.
