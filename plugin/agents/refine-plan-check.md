---
name: refine-plan-check
description: "Shared refine worker (tier-parametrised): validates the drafted plan against the current code (stale paths, unacknowledged handlers, hidden defaults) and writes its rollup back via the anchored CLI."
tools: Read, Glob, Grep, Bash
model: sonnet
---

# refine-plan-check

**Input:** the node `<slug>` + an **intensity level** (`low` · `medium` · `intense`)
passed by the refine skill.

## Intensity (B3) — scale the depth, never go blind
The refine skill sets your level from cheap signals it already has (phase count,
open-question count, greenfield vs. touches-existing-code). Adapt how deep you look
— the **output/return contract below is identical at every level**; only the
thoroughness of the inspection changes.

- **`low` — a quick sanity glance.** Scan the plan for the obvious: a phase that
  names a file path that plainly doesn't exist, an acceptance criterion that
  contradicts itself, a glaring missing decision. Cheap, fast — but **never blind**:
  if a glance turns up real drift, you still persist it (and may escalate, below).
- **`medium` — the balanced default.** Spot-check the phases that touch existing
  code against that code (the paths/handlers they name), surface the clear hidden
  defaults. The everyday depth.
- **`intense` — the full deep drift check (today's behaviour).** Inspect *every*
  phase against the current code: stale file paths, already-existing handlers the
  plan ignores, silent default decisions, every buried context-paragraph default.
  Leave nothing un-checked.

**You MAY escalate your own level.** If, while running at `low` (or `medium`), you
smell real drift — the code clearly diverges from what the plan assumes — do **not**
stay shallow: escalate to the deeper level and complete the fuller check before you
return. State the escalation explicitly in your rollup (e.g. *"started low, escalated
to intense: phase render-add references a handler that no longer exists"*). Escalate
only on a concrete signal, never speculatively.

## Read (via CLI)
```bash
anchored task get <slug>
```

## Work
Inspect the phases against the current code **at the depth your intensity level sets
(above)**: stale file paths, already-existing handlers the plan ignores, silent
default decisions. Read-only.

## Write (self-write via CLI) — PERSIST every finding, never just prose (B3)
A finding that only lives in your returned prose is lost the moment the
orchestrator doesn't read it closely — in the dogfood a real rebinding bug was
reported as prose, persisted no question, and almost slipped through. So every
actionable finding goes onto the node via the CLI:

- **An ambiguity / hidden default / decision the plan didn't settle** → a question.
  **Question lens — task / phase:** feature + UX decisions the plan quietly settled
  — behavior, style, sort order, error-UX, empty-state, accessibility, a silent
  default buried in a context paragraph. Surface generously per
  `plugin/references/question-discipline.md` (under-surface is the failure mode;
  a hidden default *is* a question):
  ```bash
  anchored task question add <slug> "<the question, with a (lean X) recommendation>" <high|medium|low>
  ```
- **A missing acceptance criterion the plan needs** (e.g. an enforcement the code
  demands) → add it to the right phase:
  ```bash
  anchored phase ac add <slug>/<phase-slug> "<observable acceptance criterion text>"
  ```
- **The rollup** (what you checked + verdict) is the audit summary, NOT where
  findings hide:
  ```bash
  anchored task log add <slug> refine learning "<plan-check rollup>"
  ```

If a finding needs a human/AI call, it MUST be a question; if it's a concrete gap
in coverage, it MUST be an acceptance criterion. Returning it as prose only is a contract violation.
