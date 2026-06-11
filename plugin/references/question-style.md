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
   answer is the **first option**, labelled `(Empfohlen)` / `(Recommended)`.

2. **Implications — 1–3 concise bullets, ABOVE the options.** What hangs on this
   decision: what each direction **breaks / enables / costs**. Keep it short —
   stichpunkte, not an essay. The point is that the user sees the consequence, not a
   treatise. Example shape:
   > Implikationen:
   > - Whole-row click: bequemer, aber kollidiert mit dem künftigen Drag-to-reorder.
   > - Dedicated checkbox: ein Klick-Target mehr, dafür reorder-safe.

3. **Each option names which implication it resolves.** In the option text (or the
   recommendation), say what that choice settles — so the user picks by consequence,
   not by guessing. For an **AI-resolved** question (the walk delegated it), the
   `reasoning` written to the decision-trail names the implications the choice
   resolved (`resolve-question … ai "<answer>" "<why + which implications it settles>"`).

## How it lives (pure prose — no schema field)

The recommendation + implications live **in the question text** (a convention, not a
new field). When an agent authors a question, it bakes them into the text:

```bash
anchored node add-question <slug> "Toggle-Interaktion: whole-row click ODER dedicated checkbox?
Empfehlung: dedicated checkbox.
Implikationen:
- whole-row: bequemer, kollidiert aber mit dem späteren Drag-to-reorder.
- checkbox: ein Target mehr, dafür reorder-safe." high
```

When the walk presents it via `AskUserQuestion`, it lifts the recommendation to the
**first option** (`… (Empfohlen)`), puts the implication bullets in the question
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
- **Language:** the project's prevailing language (German/English), per
  `communication-style.md`.
- **No cryptic abbreviations in the question the user reads.** The question text +
  its implications are plain language — never the internal ids (`q4`, `a1`, `e3`),
  raw enum tokens (`high`/`medium`/`low`), or unexplained jargon (`DAG`, `AC`). Say
  "die dritte Akzeptanz-Bedingung", "die Abhängigkeits-Reihenfolge". The internal
  ids stay in the file + audit trail (see `communication-style.md`'s abbreviation
  rule). This matters most here — a question the user can't parse can't be answered.
