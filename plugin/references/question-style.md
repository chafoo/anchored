# Question style — every user-question carries a recommendation + implications

Canonical guide for **every question anchored puts to the user** (the refine walk,
the build pre-build walk, the plan tier-classification, a stop-check escalation,
the setup/onboarding offer). Read this before authoring a question or presenting
one in an `AskUserQuestion`.

## Why

A bare question ("toggle on whole-row click or a checkbox?") makes the user do all
the thinking — and worse, it hides **what the choice costs**. The earlier reboot
surfaced questions with no implications: the user couldn't tell what a given answer
would set in motion. So every question carries three things.

## The three parts of a user-question

1. **A worked-out recommendation.** Before asking, the author (the agent that
   surfaces the question, or the orchestrator at ask-time) actually **looks at the
   code/context and forms an opinion** — it does not ask neutrally. The recommended
   answer is the **first option**, labelled `(Recommended)` (in the user's language).

2. **Implications — 1–3 concise bullets, ABOVE the options.** What hangs on this
   decision: what each direction **breaks / enables / costs**. Keep it short —
   bullet points, not an essay. The point is that the user sees the consequence, not a
   treatise. Example shape:
   > Implications:
   > - Whole-row click: more convenient, but collides with the future drag-to-reorder.
   > - Dedicated checkbox: one more click-target, but reorder-safe.

3. **Each option names which implication it resolves.** In the option text (or the
   recommendation), say what that choice settles — so the user picks by consequence,
   not by guessing. For an **AI-resolved** question (the walk delegated it), the
   `reasoning` written to the decision-trail names the implications the choice
   resolved (`resolve-question … ai "<answer>" "<why + which implications it settles>"`).

## How it lives (pure prose — no schema field)

The recommendation + implications live **in the question text** (a convention, not a
new field). When an agent authors a question, it bakes them into the text:

```bash
anchored node add-question <slug> "Toggle interaction: whole-row click OR a dedicated checkbox?
Recommendation: dedicated checkbox.
Implications:
- whole-row: more convenient, but collides with the later drag-to-reorder.
- checkbox: one more target, but reorder-safe." high
```

When the walk presents it via `AskUserQuestion`, it lifts the recommendation to the
**first option** (`… (Recommended)`), puts the implication bullets in the question
text above the options, and lets each option note what it settles. If a question
reaches the walk WITHOUT this shape (older question, or a terse one), the
orchestrator **works the recommendation + implications out at ask-time** from the
code/context before presenting — never ask the bare question.

## Boundaries

- **Concise.** 1–3 implication bullets. If a decision genuinely has more, name the
  top ones and stop — an overlong `AskUserQuestion` defeats the purpose.
- **Honest recommendation.** Recommend what the code/context actually favours, not a
  default-to-be-safe. If it's genuinely a coin-flip, say so and recommend the
  lower-risk side.
- **Language:** the language the user speaks, per `communication-style.md`.
- **No cryptic abbreviations — and no framework-process jargon — in the question
  the user reads.** The question text + its implications are plain language: never
  the internal ids (`q4`, `a1`, `e3`), raw enum tokens (`high`/`medium`/`low`),
  unexplained abbreviations (`DAG`, `AC`), **or the names of anchored's internal
  processes** (`scaffold`, `stub`, `seam`, `grounding`, `roll-up`, `outcome acceptance criterion`,
  `executor`, the `each:task` loop, `drafted`/`refined`, `concern`). Say "the third
  acceptance criterion", "the dependency order", "an open point for the
  end" — apply the **jargon mapping table in `communication-style.md`** (its
  "framework-process jargon" hard rule) before presenting. The internal ids + term
  names stay in the file + audit trail. This matters most here — a question the user
  can't parse can't be answered.
