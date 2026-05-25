---
name: impl
description: |
  Autopilot for the full anchored task lifecycle. Composes /impl-plan
  → /impl-build → /impl-wrap sequentially on a single user invocation
  with `/impl <task description>`. Halts on any phase failure or
  blocking question — user can intervene then re-run /impl (which
  resumes via state-gating). Explicit-only trigger.
---

# /impl

You are the autopilot orchestrator. The user typed
`/impl <description>` and wants the full plan → build → wrap flow
run end-to-end without manually invoking each skill.

You are a thin composer over the three lifecycle skills. State gates
between them (the task-file's `status` field) ensure each runs in
order. Your only real logic: decide whether to advance based on the
outcome of each phase.

## Pre-flight

1. **Resolve task state.** If the user gave a slug or path, use that.
   Otherwise derive a slug from the description (same logic as
   `/impl-plan`'s slug derivation).
2. **Read the task-file** (if it exists) to determine starting status:
   - File missing → start at plan
   - `status: plan` → start at plan (resume or fresh refinement)
   - `status: build` → start at build (skip plan)
   - `status: wrap` → start at wrap (skip plan + build)
   - `status: done` → tell user "Already done." and exit.

This is what makes `/impl` resume-friendly: re-running on a partially
complete task just picks up at the right stage.

## Composition

Run each lifecycle skill in turn, gated on status:

### 1. Plan stage

If status is `plan` (or file missing):

- Invoke the `/impl-plan` skill (programmatically — read its SKILL.md,
  follow its logic, OR delegate via Skill tool if the framework
  supports skill-to-skill invocation).
- Inputs: the user's task description.
- Wait for it to complete. It will run the Q&A loop with the user
  for blocking questions — that's expected user interaction.
- After it completes, the task-file should be `status: build`.

**If plan fails or user cancels mid-Q&A:**
- Don't advance. Tell the user what happened, leave the file at
  whatever status it reached, exit. They can re-run `/impl` to
  resume.

### 2. Build stage

If status is now `build`:

- Invoke `/impl-build`.
- Inputs: the task slug.
- It will loop through phases; each may take time (and tool calls).
- After it completes, the task-file should be `status: wrap`.

**If build hits hard blockers** (every phase blocked, or critical
implement-agent failure): the build orchestrator will still
transition to `wrap` if possible (so wrap-step's TL;DR can report).
But if it can't even reach wrap, surface the failure clearly.

### 3. Wrap stage

If status is now `wrap`:

- Invoke `/impl-wrap`.
- Inputs: task slug.
- It runs review + summarize, then transitions to `done`.

### 4. Done

Final user message:

```
Autopilot complete on `<slug>`.

  Plan:  <N phases planned, M ACs total>
  Build: <P done / Q blocked / R deferred>
  Wrap:  <summary highlights from ### Wrap>

Status: done. See `.claude/tasks/<slug>.md` for the full audit trail.
```

## Halting behavior

The autopilot HALTS (doesn't advance to next stage) when:

1. **User cancels mid-Q&A** during plan. (User intervention; their call.)
2. **Plan fails to produce a valid task-file.** Surface error, exit.
3. **Build can't reach wrap** (catastrophic implement-agent failure,
   service-layer error). Surface error, exit.
4. **Any user input is needed beyond what the agents handle.**

In all halt cases, the task-file's `status` reflects the actual state
reached. Re-running `/impl` picks up from there — that's the
resume-friendly composition.

## What `/impl` is NOT

- Not a way to bypass quality gates. task-check and code-check still
  run per phase during build.
- Not a way to skip Q&A. Blocking questions still surface to the user
  during plan.
- Not a way to skip the review step in wrap.

It's purely a convenience composer — "run the three I'd normally
run, in order, stopping when intervention is needed."

## Framework defaults (always run)

- State-gate every stage transition based on actual task-file status,
  not assumed progress.
- Preserve all the framework defaults of each sub-skill (they apply
  regardless of how /impl composed them).
- Halt and report on any sub-skill failure rather than barreling
  through.

## References on demand

- See SKILL.md files in `skills/impl-plan/`, `skills/impl-build/`,
  `skills/impl-wrap/` for the sub-skill behavior in detail.
