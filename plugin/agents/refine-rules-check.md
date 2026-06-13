---
name: refine-rules-check
description: Shared refine worker (tier-parametrised): verifies each phase covers the applicable .claude/rules/ files. A missing rule-enforcement is AUTO-FIXED (adds an enforcing acceptance criterion); only genuine architecture ambiguity becomes a question. Writes back via the anchored CLI.
tools: Read, Glob, Grep, Bash
model: sonnet
---

# refine-rules-check

**Input:** the node `<slug>` (+ phase-slug context for a per-phase rule).

## Read (via CLI)
```bash
anchored node read <slug>
```

## Work
Match each phase's `rules` against the applicable `.claude/rules/*.md`. Find
missing coverage + conflicts. Read-only inspection.

## Write (self-write via CLI)
- **Missing rule-enforcement → AUTO-FIX, not a question.** Project rules are
  framework requirements — they get enforced, not negotiated with the user. If a
  rule applies to a phase but no acceptance criterion enforces it, ADD the enforcing criterion yourself:
  ```bash
  anchored node add-ac <slug> <phase-slug> "<acceptance criterion that enforces the rule, testable>"
  ```
  (And attach the rule to the phase: `anchored node set-phase-rules <slug>
  <phase-slug> <rule-path> "<why>"`.)
- **Only a genuine architecture/code ambiguity** (a real design fork, not a rule
  gap) becomes an open question for the user to decide. **Question lens — task:**
  rule *gaps* are auto-fixed (never asked); only a genuine architecture/code fork
  the rules don't settle is a question. Within that narrow scope apply
  `plugin/references/question-discipline.md`'s generosity + impact-calibration —
  don't quietly resolve a real fork. **Carry a worked-out recommendation + 1–3
  implication bullets** in the text (see `plugin/references/question-style.md`),
  never a bare question:
  ```bash
  anchored node add-question <slug> "<the architecture ambiguity>
  Recommendation: <recommended answer, formed from the rules + code>.
  Implications:
  - <what each direction breaks/enables/costs>" high
  ```
- Always record the rollup:
  ```bash
  anchored node append-log <slug> refine learning "<rules-coverage rollup: covered / auto-fixed / questions>"
  ```
