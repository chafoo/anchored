← [stages](_stages.md)

# Refine

The Refine stage (`/a:refine <slug>`) is anchored's mandatory engineering-review gate between a drafted plan and the build. One always-on gate agent validates the plan against the current code (further gates — e.g. a rules-coverage check — are user-wired via anchored.yml), then you pick a per-run involvement level and walk the open questions — each presented with a recommendation and its implications — before the work flips from drafted to refined.

```mermaid
flowchart TD
  start([drafted plan]) --> preflight[Pre-flight: require status drafted]
  preflight -->|task tier| pc[plan-check: validate plan against current code]
  preflight -->|epic tier| epc[epic-plan-check: ground task stubs + order]
  epc --> ed[epic-decompose: author outcome acceptance criteria]
  pc --> style[Pick walk-style: how involved you want to be]
  ed --> style
  style --> walk[Walk every open question]
  walk -->|above the bar / on topic| you[You decide, with recommendation + implications]
  walk -->|below the bar| ai[AI decides, with recorded reasoning]
  you --> exec[Decide per-phase parallel vs sequential]
  ai --> exec
  exec --> custom[Run custom refine steps]
  custom --> done{All questions resolved?}
  done -->|yes| refined([refined → run /a:build])
  done -->|no / gate error| stay([stay drafted, resume later])
```

## What you can do

- **Validate the drafted plan against the actual current code** — stale file paths, handlers that already exist, and silent default decisions are surfaced instead of slipping through.
- **Optionally get every phase checked against the project's rules** (`.claude/rules/*.md`) by wiring the shipped `refine-rules-check` agent in as a custom step. When wired, missing rule-enforcement is auto-fixed by adding an enforcing acceptance criterion, so you are never pestered to "negotiate" framework requirements.
- **Choose how involved you want to be in the questions, per run** — just the important ones (default), important plus medium, all of them, none (the AI decides everything), or only questions touching topics you name in free form (e.g. "anything about persistence or the UI language, decide the rest").
- **Answer each surfaced question by consequence** — a worked-out recommendation is presented as the first option, plus 1–3 plain-language implication bullets, so you decide on the merits rather than guessing.
- **(Epics) Walk the epic's own scope and split questions now, and set a separate policy for the questions inside individual child-tasks later** — either one policy for all tasks, decide-per-task at build time, or a topic-based free-form filter.
- **Decide, once per run, whether safe phases build in parallel or one-after-another** so you can watch — a pure speed-versus-watchability call. The quality is identical either way.
- **Add your own custom refine steps in `anchored.yml`** beyond the built-in gate and have them run in declaration order.
- **Abort the walk safely** — already-answered questions persist, and re-running only walks the still-open ones.

## How to run it

| | |
|---|---|
| **Command** | `/a:refine <slug>` (slug optional) |
| **When** | After `/a:plan` produced a drafted plan, and before `/a:build`. |
| **Precondition** | The node must be at status `drafted`; otherwise the run is gated. |
| **On finish** | The status flips `drafted → refined`, and you are told to run `/a:build`. |

## Steps under the hood

1. **Pre-flight** — checks the node is at status `drafted` and assembles the step plan (the stage orchestrates; it does not blindly spawn).
2. **plan-check** (task tier) — validates each phase against the current code (stale paths, existing handlers, hidden defaults) and persists every finding as a question or a missing acceptance criterion, never as prose only.
3. **rules-check** (task tier, optional — only when wired in anchored.yml) — matches each phase against the applicable `.claude/rules/*.md`, auto-fixes missing rule-enforcement by adding an enforcing acceptance criterion, and only turns a genuine architecture fork into a question.
4. **epic-plan-check** (epic tier, instead of plan-check) — grounds the task stubs and their dependency order against real code, cites `file:line`, and surfaces scope/decomposition forks as questions.
5. **epic-decompose** (epic tier) — authors 3–6 outcome-level acceptance criteria per stub (the epic-to-task contract), plus at least one whole-epic integration acceptance when dependent tasks exist.
6. **Pick the walk-style** — counts the open questions by priority and asks which ones you want a say in (or skips silently when there are none).
7. **(Epics) Pick the child-task question policy** — a second, separate choice for the questions inside child-tasks later in build (epic-wide, just-in-time per task, or topic conditions).
8. **Walk every open question** — above-the-bar / on-topic questions go to you with a recommendation and implications; the rest the AI resolves with recorded reasoning.
9. **Decide per-phase execute mode and dependencies** (task tier) — defaults to the fastest safe path (a phase with 2+ genuinely independent acceptance criteria fans out, otherwise sequential), honoring your speed-versus-watch choice.
10. **Run any custom refine steps** in declaration order.
11. **Finish** — receipts every executed refine step (`step done`/`step skip` — the CLI blocks the flip until each served step carries one), writes the gate summaries, and only once every question is resolved flips `drafted → refined`. On a gate error or aborted walk, it stays `drafted` and re-running resumes the still-open questions.

## Configure it

The built-in gates (plan-check on tasks; epic-plan-check + epic-decompose on epics) always run, regardless of config — they are the engineering-review floor. Everything below is optional tuning.

| Knob | Default | What it does |
|---|---|---|
| `task.refine.steps` | `[plan-check, walk]` | The task refine pipeline. Append your own `use:` steps (e.g. `{ name: rules-check, use: { type: agent, name: refine-rules-check }, with: plan-check }`). |
| `epic.refine.steps` | `[epic-plan-check, epic-decompose, walk]` | The epic refine pipeline (ground stubs, author outcome criteria, walk). |
| `*.refine.steps[].involve` | `high-only` | The default question-involvement bias for the walk, before the per-run walk-style override. |

A custom step's worker is declared inline as `use: { type: agent | skill, name }` — it spawns a subagent or skill that writes to a custom field. (A command for it goes in the prose instructions, not as a run-command.)

Three choices in Refine are **ephemeral per-run** and are never persisted to `anchored.yml`: the walk-style (how involved you are), the epic child-task question policy, and the parallel-versus-sequential speed call. The per-phase fan-out levers are recorded on the phase itself, not in config — `anchored phase set-execute <slug>/<phase> workflow|sequential` and `anchored phase set-depends <slug>/<phase> "<phase slugs>"`.
