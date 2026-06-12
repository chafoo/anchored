# Question discipline — when to surface, and how generously

Companion to `question-style.md`. The two are distinct, and you need both:

- **`question-style.md` = HOW you phrase a question** — the worked-out
  recommendation + the 1–3 implication bullets, in plain language.
- **`question-discipline.md` (this file) = WHEN you raise one at all, and how
  generously.** The decision to surface, not the wording.

Read this before authoring questions in any plan/refine worker. The mechanic below
is universal; *what counts as an ambiguity* differs per tier — that's the **lens**
each authoring agent carries (see its "Question lens" line).

## The core stance: over-surface is fine, under-surface is the failure mode

Be generous. A question too many costs the user three seconds in the walk; a
question too few bakes a decision they never got to make. Every real dogfood
regression here was *under*-surfacing — the worker quietly decided something and
moved on. When you're unsure whether something is worth a question: **it is.**

## You write down questions — you never write down silent decisions

Every place the input is silent and reasonable people would disagree is a question,
full stop. Do **not** bake your judgment into the plan as a "default", a
"documented assumption", or a sentence buried in a context paragraph. If you catch
yourself writing prose like *"we'll use whole-row click since it matches the
existing CSS"* or *"newest tasks render at the bottom"* or *"empty input is
silently ignored"* — **stop.** Each of those is a unilateral product decision in
disguise. Convert it into a question instead. This is a hard rule, not a guideline.

## "I'll just pick X" = that IS the question

The cleanest tell: the moment you think *"I'll just go with X"* about something the
input didn't specify, you've found a question. Pick X as your **recommendation**
(carry it as the `(lean X — because Y)` per `question-style.md`), but surface it —
don't swallow it. That keeps you out of decision-territory while still giving the
user a fast "yes, your default" path in the walk.

## Priority calibration — by impact, not difficulty

Tag every question on what it costs to get wrong, not how hard it is to answer:

- **high** — would the user be upset to discover this got decided without them?
  (Changes product scope / direction / the acceptance bar.) Tag high.
- **medium** — shapes how the thing *feels* but is swappable later? Tag medium.
- **low** — a pure tweak, completely reversible in five minutes? Tag low.

**When in doubt, tag higher** — the refine walk can always downgrade, but a buried
low-tag question the user never sees can't be upgraded.

## The lens is tier-specific

What *counts* as a surfaceable ambiguity depends on the tier you're working:

- **Task / phase** — feature + UX decisions: behavior, visual style, sort order,
  error-UX, empty-state, accessibility level, whether a sub-feature (delete,
  pagination, undo) is in scope.
- **Epic** — scope + decomposition decisions: how the work splits into tasks, what
  is in/out of this epic, where the task boundaries fall, the integration contract
  between tasks, the dependency edges.

Your agent's own **"Question lens"** line names the one that applies to you. Apply
this file's stance + calibration *through* that lens.
