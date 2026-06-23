# Ticket: dogfood-fixings-4 — Question discipline universal (bring generosity back)

**Source:** Conversation after the hardening. Observation from all v2 dogfood runs:
constantly "0 open questions". By the v1 standard (*under-surface is the failure
mode*) that's a warning sign — v2 surfaces too little.

## Problem
v1 (`~/Dev/anchored/plugin/agents/plan.md`) had a rich question tuning:
generosity directive, the "I just pick X = that IS the question" reflex, a
taxonomy of WHEN, the parenthetical-recommendation trick, priority calibration. When
slimming down the v2 decompose agents this was **partly lost** — the
*structure* (split plan/refine, walk-style, `question-style.md`) stayed, the
*generosity tuning* did not.

## Solution: one universal principle, per tier only the lens
The v1 tuning isn't task-specific — the mechanism is universal, only "what counts
as ambiguity" differs. So DRY:

- **Universal reference `plugin/references/question-discipline.md`** (generalized
  from v1): "over-surface ok, under-surface = failure mode" · "I just pick
  X = the question" · parenthetical recommendation (`… ? (lean X — because Y)`) ·
  priority test ("would the user be annoyed if this was decided without them?" =
  high; shapes-the-feel-but-swappable = medium; reversible-in-5-min = low).
  Distinguishes itself from `question-style.md`: *discipline* = WHEN/how generous,
  *style* = HOW phrased (recommendation + implications).
- **Per tier 2–3 lines "what is a question here":**
  - *Task/Phase:* Feature/UX decisions — behavior, style, sorting,
    error UX, empty state, A11y.
  - *Epic:* Scope/decomposition decisions — how it's split, what's
    in/out, where the task boundaries run, the integration contract, the
    dependency-graph edges.

## Affected
- NEW: `plugin/references/question-discipline.md`.
- Link + add tier lens: plan-decompose, epic-decompose, refine-plan-check,
  refine-rules-check, epic-plan-check.

## Acceptance
- a1: universal reference exists (the v1 directives, generalized).
- a2: every question-authoring agent links it + carries its tier-specific lens.
- a3: Epic gets the decomposition lens (scope/split/integration/dependency-graph).
- a4: Grep test secures the wiring; a dogfood/dry run surfaces questions again
  instead of "0".
