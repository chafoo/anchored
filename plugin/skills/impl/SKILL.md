---
name: impl
description: |
  Autopilot for the full anchored task lifecycle. Composes
  /impl-plan → /impl-refine → /impl-build → /impl-wrap sequentially
  on a single user invocation with `/impl <task description>`.
  Halts on any phase failure or blocking question — user can
  intervene then re-run /impl (which resumes via state-gating).
  Explicit-only trigger.
---

# /impl

## Communication style

See `plugin/references/communication-style.md` for the full principle —
partner voice in chat. The autopilot is a composer, not a narrator:
sub-skills already speak in partner voice, you just relay + bridge
between stages.

Skill-specific:

| Avoid (machinery voice) | Prefer (partner voice) |
|---|---|
| "Sub-skill /impl-plan exited with status: drafted; advancing to /impl-refine" | "Plan steht. Jetzt der refine-pass." |
| "Composition halted: state-gate refused advance (status: drafted, expected: refined)" | "Refine hat noch offene fragen — beantworte die, dann mach ich weiter." |
| "Autopilot complete: 4 stages executed, final state=done" | "Durch — plan, refine, build, wrap alle sauber. Status: done." |

You are the autopilot orchestrator. The user typed
`/impl <description>` and wants the full plan → refine → build → wrap
flow run end-to-end without manually invoking each skill.

You are a thin composer over the four lifecycle skills. State gates
between them (the task-file's `status` field) ensure each runs in
order. Your only real logic: decide whether to advance based on the
outcome of each phase.

## Pre-flight

1. **Resolve task state.** If the user gave a slug or path, use that.
   Otherwise derive a slug from the description (same logic as
   `/impl-plan`'s slug derivation).
2. **Read the task-file** (if it exists) to determine starting status.
   Match exactly one of these 7 cases:

   | Pre-flight state    | Autopilot action                        |
   |---------------------|-----------------------------------------|
   | missing task file   | start at /impl-plan                     |
   | `status: plan`      | resume /impl-plan (refinement loop)     |
   | `status: drafted`   | start at /impl-refine                   |
   | `status: refined`   | start at /impl-build                    |
   | `status: build`     | resume /impl-build (in-progress phases) |
   | `status: wrap`      | resume /impl-wrap                       |
   | `status: done`      | tell user "Already done." and exit      |

   The status field is the single source of truth. Don't second-guess
   by inspecting phase counts or evidence — the state machine has
   already decided which stage owns the task.

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
- After it completes, the task-file should be `status: drafted`.

**If plan fails or user cancels mid-Q&A:**
- Don't advance. Tell the user what happened, leave the file at
  whatever status it reached, exit. They can re-run `/impl` to
  resume.

### 2. Refine stage

If status is now `drafted`:

- Invoke `/impl-refine`.
- Inputs: the task slug.
- It runs plan-check + rules-check (the two mandatory gates), then
  any user-defined refine steps from `anchored.yml.refine.steps`.
  Each gate may surface new `→ ?` markers requiring Q&A with the
  user.
- After it completes, the task-file should be `status: refined`.

**If refine fails or user aborts a Q&A:**
- Don't advance. Status stays at `drafted`; auto-fixes already
  applied by plan-check / rules-check are preserved (per-op
  atomicity). Surface the abort, exit. Re-running `/impl` picks up
  from refine.

### 3. Build stage

If status is now `refined`:

- Invoke `/impl-build`.
- Inputs: the task slug.
- It will loop through phases; each may take time (and tool calls).
- After it completes, the task-file should be `status: wrap`.

**If build hits hard blockers** (every phase blocked, or critical
implement-agent failure): the build orchestrator will still
transition to `wrap` if possible (so wrap-step's TL;DR can report).
But if it can't even reach wrap, surface the failure clearly.

### 4. Wrap stage

If status is now `wrap`:

- Invoke `/impl-wrap`.
- Inputs: task slug.
- It runs review + summarize, then transitions to `done`.

### 5. Done

Final user message:

```
Autopilot complete on `<slug>`.

  Plan:   <N phases planned, M ACs total>
  Refine: <plan-check: P auto-fixes / rules-check: Q auto-fixes / R custom steps>
  Build:  <S done / T blocked / U deferred>
  Wrap:   <summary highlights from ### Wrap>

Status: done. See `.claude/tasks/<slug>.yml` for the full audit trail.
```

The refine line surfaces the gate outcomes the user might otherwise
miss — plan-check + rules-check auto-fix counts capture how much
drift the refine stage caught, custom-step count captures what their
own pipeline added.

## Halting behavior

The autopilot HALTS (doesn't advance to next stage) when:

1. **User cancels mid-Q&A** during plan or refine. (User intervention;
   their call.)
2. **Plan fails to produce a valid task-file.** Surface error, exit.
3. **Refine fails** (user aborts a gate's Q&A, or a custom refine
   step exits non-zero). Status stays at `drafted`; user can fix and
   re-run `/impl`.
4. **Build can't reach wrap** (catastrophic implement-agent failure,
   service-layer error). Surface error, exit.
5. **Any user input is needed beyond what the agents handle.**

In all halt cases, the task-file's `status` reflects the actual state
reached. Re-running `/impl` picks up from there — that's the
resume-friendly composition.

## What `/impl` is NOT

- Not a way to bypass quality gates. task-validate and code-validate still
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

- See SKILL.md files in `skills/impl-plan/`, `skills/impl-refine/`,
  `skills/impl-build/`, `skills/impl-wrap/` for the sub-skill
  behavior in detail.
