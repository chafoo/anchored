---
name: refine
description: Validate a drafted plan against current code + rules and walk the open questions before build, orchestrating the refine agents in-session. Triggers ONLY on the explicit `/a:refine <slug>` command. Use for `/a:refine`, not for general code review.
---

# /a:refine — fractal refine stage (skill-orchestrated)

Explicit-only: the user typed `/a:refine <slug>`.

## Communication style

Partner voice in chat, machinery only in the audit trail — see
`plugin/references/communication-style.md`:

| Avoid (machinery) | Prefer (partner) |
|---|---|
| "Spawning plan-check + rules-check in parallel…" | "Let me check the plan against the current state of the code." |
| "epic-refine runs epic-plan-check → epic-decompose → walk" | "I'll check the two tasks against the code and work out their acceptance criteria." |
| "walk-style = high-together" | "Okay — I'll settle the important ones with you and handle the rest myself." |
| "status transition drafted → refined" | "Plan's been talked through. Run `/a:build`." |

**Before every user-facing line**, apply the jargon mapping from
`communication-style.md` — framework terms (scaffold, stub, seam, grounding,
roll-up, outcome acceptance criteria, execute, the each-loop, drafted/refined,
concern, dependency graph, just-in-time) never belong in chat, only their plain
words.

The skill is the **orchestrator**: it consults the `anchored` CLI for the
step-plan + node ops and spawns the refine agents itself via the **Task tool**
(agents self-write via `anchored <tier> …`, see
`plugin/references/agent-contract.md`). The CLI never spawns.

## Pre-flight + plan

1. `anchored <tier> refine <slug>` → `{ stage, tier, node, steps }` (tier derived from the
   node; does NOT spawn). State gate: refine expects `drafted`.
2. `steps` is the resolved refine pipeline: for a task
   `[plan-check, rules-check, walk]`, for an **epic**
   `[epic-plan-check, epic-decompose, walk]` (D2 — epic-refine is a REAL stage:
   ground the stubs against code, then author per-stub outcome acceptance criteria, then walk).

## Spawn each step's agent (Task tool, in order)

**Task tier:**
- **plan-check → refine-plan-check** — validates the plan against current code
  (stale paths, unacknowledged handlers, hidden defaults); self-writes the rollup:
  `anchored task append-log <slug> refine learning "<plan-check rollup>"`. Any
  drift it can't auto-fix becomes an open question.
- **rules-check → refine-rules-check** — verifies each phase covers the applicable
  `.claude/rules/*.md`; self-writes the coverage rollup via `append-log`. A missing
  rule-enforcement is an **auto-fix** (the agent adds an enforcing acceptance
  criterion itself), NOT a user question — project rules are framework requirements that get enforced, not
  negotiated. Only a genuine architecture/code ambiguity becomes an open question.

**Epic tier (D2):**
- **epic-plan-check → epic-plan-check** — grounds the epic's task-stubs + their
  dependency order against the real code (seams exist, no drift, the order is
  sound); writes the grounding rollup to `context.refine`; genuine
  scope/architecture ambiguities → open questions.
- **epic-decompose → epic-decompose** — authors **outcome-level task acceptance
  criteria per stub** (`anchored epic child-ac-add <epic> <stub> "<outcome acceptance criterion>"`,
  the Epic→Task contract). These seed the just-in-time `plan task`'s phase
  decomposition at build (so the contract is never lost — the G8 fix) and are what
  the wrap roll-up validates the built task against.
- **walk** — the consolidated Q&A walk. **First, pick the walk-style** (this is the
  v1 Stage-0 choice, ephemeral — never persisted): read the open questions
  (`anchored <tier> get <slug>` and filter `questions[]` for open), count them by
  priority, and ask the user via `AskUserQuestion`:

  Phrase it for a human — **plain priority words, no raw enum tokens, and the
  walk-style codes stay INTERNAL** (they're only the value you pass to
  `resolve-question`, never a user-visible label):

  > "N questions — X important, Y medium, Z minor. How do you want to go through them?"
  > - **Just the important ones — I'll decide the rest** (internal: `high-together`,
  >   the recommended default / sweet spot)
  > - **Go through all of them together** (internal: `all-together`)
  > - **You decide everything** (internal: `AI-all`)

  **If there are 0 open questions, skip this silently** (no AskUserQuestion). Then
  walk each question in priority order per the chosen style: a question AT-or-above
  the threshold goes to the user (`resolve … user "<answer>"`); the rest the AI
  decides WITH reasoning (`resolve … ai "<answer>" "<why>"` — reasoning is
  required for `source=ai`).
  `anchored <tier> question-resolve <slug> <id> "<answer>" <user|ai> ["<reasoning>"]`

### Epic-wide question policy (H3 — epics only)

When you refine an **epic**, the choice above ALSO decides how the questions that
arise *later* — in each child-task's own refine during the build loop — get handled.
For an epic, offer a **fourth, richer option** and remember the choice for the build:

> "How do you want to handle the questions — including the individual tasks later?"
> - **Just the important ones — I'll decide the rest** (the recommended default;
>   internal: `high-together`)
> - **Go through all of them together** (internal: `all-together`)
> - **You decide everything** (internal: `AI-all`)
> - **Tell me what you want a say in** — free-form, e.g. "ask me about anything
>   touching persistence or the UI language, decide the rest yourself"
>   (internal: `conditions`, plus the user's own words)

This follows `plugin/references/question-style.md` (recommended option first,
implications named). Hold the chosen policy **in your working memory for this epic
run** — ephemeral, never written to a field. Within the same session it carries from
refine into the `/a:build` loop, where it governs every child-task's refine. The
free-form option is epic-only (a single task's refine just uses the three fixed
styles; its build-time decisions are already covered by the stop-conditions).

  **Every question you put to the user follows `plugin/references/question-style.md`:**
  the question text already carries a worked-out **recommendation** + 1–3
  **implication** bullets (the authoring agent baked them in). In the
  `AskUserQuestion`, present the **recommended answer as the FIRST option** labelled
  `(Recommended)`, put the implication bullets in the question text above the options,
  and let each option note what it settles. If a question arrives WITHOUT that shape
  (terse/older), **work the recommendation + implications out yourself at ask-time**
  from the code/context before presenting — never ask the bare question. For an
  **AI-resolved** question, the `reasoning` you record names the implications the
  choice settled.

## Custom run/use steps (the config's own steps)

`anchored <tier> refine <slug>` returns the FULL plan — a user can add their own
refine steps beyond the gates. Dispatch them in declaration order at their plan
position: **`kind: 'run'`** → execute via Bash with the variable contract as real
env vars (`TASK_SLUG` = the node, `EPIC_SLUG` = parent epic or empty); a non-zero
run-step is a real failure → surface it, stay `drafted`. **`kind: 'use'`** → spawn
the named subagent / skill with its `instructions`; a worker writes results to a
declared custom field via `anchored <tier> set <slug> <field> "<value>"`. Keep
the plumbing out of chat — narrate the outcome, not the command.

## Failure-handling

If a gate agent errors, surface it and stay at `drafted` (do not flip). If the
user aborts the walk, already-resolved questions persist; re-running `/a:refine`
walks only the still-open ones.

## Decide the per-phase execute mode + phase dependencies (fan-out — task tier only, G12)

The fan-out mechanism already exists (the build SKILL runs `execute: workflow`
phases as a parallel per-criterion Dynamic Workflow). What was missing is the **decision** —
so by default every phase ran sequentially (a ~44-min epic for ~200 lines). Refine
is where that call belongs, because the phases + their acceptance criteria are now settled.
Two levers live here, both recorded ON THE PHASE (never global config):

- **Phase intra-fan-out** — a phase's `execute` mode (`set-execute`): do this phase's
  acceptance criteria fan out in parallel (`workflow`) or land sequentially (`sequential`)?
- **Multi-phase parallelism** — a phase's `depends_on` (`set-depends`): which sibling
  phases must finish before this one? Independent phases build in parallel via
  `ready-phases`; the dependency chain sequences. Set the edges where one phase truly
  needs another's output; leave independent phases free of each other.

**Default to the fastest safe path.** For each phase (`anchored task list-phases
<slug>`), the call is about **correctness, never quality** — parallel and sequential
build the exact same thing:

- **Safety-floor (hard, non-negotiable — this is correctness, NOT
  speed-vs-quality).** Fan-out is safe only when the phase's acceptance criteria are
  genuinely **independent**: no criterion depends on another's output, and no two
  criteria mutate the same region of the same file. Non-independent criteria would
  race → corruption. That's the only thing the floor protects.
- **Within "safe" → default to `workflow`** (the fastest path), not sequential. A
  phase with **≥2 independent acceptance criteria fans out by default**:
  `anchored phase set-execute <slug>/<phase> workflow`.
- **`sequential`** only when the floor doesn't hold — a single
  criterion, or criteria that share sequential state / build on each other / touch
  the same region — **or** when you're genuinely unsure two criteria are independent
  (when the doubt is about *correctness*, stay sequential; leave it unset, absent ⇒ sequential).
- **Phase dependencies** follow the same independence test, one tier up: record
  `anchored phase set-depends <slug>/<phase> "<comma-separated phase slugs>"` only
  where a phase genuinely consumes another's output. Phases left without a dependency
  edge are treated as independent and build in parallel.

**Ask the user once — speed vs. watchability (never a quality call).** The ONLY real
difference between parallel and sequential is that sequential lands the phases one
after another (the user can half-watch) while parallel lands them together — the
quality is identical. So offer it once, ephemeral (like the walk-style), phrased per
`question-style.md`:
> "Where it's safe — as fast as possible (parallel) or one after another so you can
> follow along? Purely speed vs. watching — the quality is identical." Default: as
> fast as is safe.

Hold the answer in memory for this refine. If they pick "sequential to watch", leave
`execute` unset regardless of the floor and don't add parallelizing phase edges. The
user can always override a single phase with `set-execute` / `set-depends` before build.
Epics have no phases — task-level fan-out across independent child-tasks is a
separate lever (the epic build loop), not this decision.

## Finish

Write the refine-trail (the plan-check + rules-check rollups) to context.refine,
then — only when **every** question is resolved — flip the status:
```bash
anchored <tier> set <slug> context.refine "<plan-check + rules-check rollups>"
anchored <tier> status <slug> refined
```
Tell the user: *"Plan's been talked through — N+M auto-fixes, K questions settled. Run `/a:build`."*
No MCP, no raw node-file edit.
