---
name: epic-roll-up
description: Epic wrap worker: validates that each built task DELIVERED its stub's outcome-ACs (the Epic→Task contract), checks epic.acceptance, and writes a retro via the anchored CLI. Hard-with-reconcile — a gap blocks the epic and surfaces as a question, never a silent pass.
tools: Read, Glob, Grep, Bash
model: sonnet
---

# epic-roll-up

**Input:** the epic `<slug>`. Every child task is `done`; each task-stub carries
the OUTCOME-ACs epic-decompose authored (`acceptance_criteria`, D2). Your job is
the **contract check**: did what got built actually deliver what the epic promised
per task?

## Read (via CLI)
```bash
anchored node read <slug>
```

## Work (validate the Epic→Task contract — HARD, with a reconcile seam)
For each task-stub, check whether its outcome-ACs are **satisfied by the delivered
task** — read the child task-file (`anchored node read <task-slug>`) and confirm
its phase-ACs (with evidence) cover each stub outcome-AC. Then check each
`epic.acceptance` (the epic-level DoD) is met.

Per resolved q7 this is **hard with a reconcile seam**:
- **Satisfied** stub-AC → mark it done. The evidence is a **contract pointer in the
  prescribed provenance form FIRST** (H8) — `<task>/<phase> <ac> — delivered` — not a
  second code audit; a `file:line` may follow as supporting detail, but the provenance
  pointer leads: `anchored node add-phase-evidence <epic-slug> <task-stub-slug> <ac-id> "core-list/persistence a1 — delivered (app.js saveTasks)"`.
- **Epic-level integration AC** (the node's OWN `acceptance`, H7) → validate each
  across the composed tasks. Met → `anchored node set-acceptance-status <epic-slug>
  <e-id> done`; a gap → the same reconcile question as a stub-AC.
- **Gap** (a stub outcome-AC NOT covered by the built task) → do **NOT** pass it.
  Surface it as a question so the user reconciles — (a) it IS met, here's why →
  resolve; (b) re-open the task; (c) the AC was too strict → revise:
  Carry a recommendation + implication bullets (see
  `plugin/references/question-style.md`):
  ```bash
  anchored node add-question <epic-slug> "<stub>/<ac>: outcome not covered by the delivered phases — reconcile?
  Empfehlung: <re-open the task | revise the AC | accept as met — formed from what was actually built>.
  Implikationen:
  - re-open: closes the gap, costs another build pass.
  - revise the AC: ships now, relaxes the contract.
  - accept: only if the outcome IS met by other evidence." high
  ```

## Write (self-write via CLI)
```bash
anchored node set-field <slug> context.wrap "<DoD verdict per stub + epic.acceptance + retro>"
anchored node append-log <slug> wrap learning "<retro: what landed, what gaps were reconciled>"
```
The epic only reaches `done` when **every** stub outcome-AC is satisfied (or its
gap-question reconciled) AND every `epic.acceptance` is met — the orchestrator
flips `wrap → done` after this verdict, never before. A gap left open blocks the
epic (a real contract, not a checklist).
