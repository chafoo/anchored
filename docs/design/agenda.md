# Fractal Redesign — Agenda (one thing at a time)

> Open questions + ideas we walk through in order, BEFORE we touch architecture.
> Goal of this phase: understand + decide, not yet build.
> Companion docs: `fractal-redesign-notes.md` (decision record),
> `docs/drafts/fractal-lifecycle.md`, `docs/drafts/anchored.default.yml`.

## Scope guardrail (set by the user)

- **Now**: cleanly rebuild the whole thing + test it. **Later**: build our own
  agents ourselves (custom agent SDK or similar) — too much for now, parked.

## To walk through

### 1. Plan-entry signature + epic/task classification ✅ DECIDED
- For details see `fractal-redesign-notes.md` → "Plan-entry + epic/task classification".
- Short: `/impl-plan <epic|task>?` ; without a tier → discover → classify → confirm.
  discover at both tiers. Detection: <5 task / 5–9 independence test / ≥10 epic.
  Fractal escalation is cheap; auto = v2.

### 2. Execution substrate of the loop ✅ DECIDED, then ABANDONED
- ~~Headless `claude -p` per task-file, phases in-process; `spawn` left open as a
  seam.~~ → **ABANDONED** (`remove-headless-engine-path`): a headless subprocess
  can't reach the session's Task tool, so the in-session **skill** is the executor.
  Record in the notes.

### 3. Architecture principle: fractal factory functions ✅ DECIDED
- Detail + diagrams: `docs/design/engine-architecture.md`; record in the notes.
  Note: the factory pattern stays for the substrate/ops; the engine-run chain it
  originally drove was removed (`remove-headless-engine-path`).

### 4. Agent organization into buckets ✅ DECIDED
- No subfolders (CC only scans flat) → prefix buckets. Roster = distinct
  workers; shared ones tier-parameterized. Record in the notes.

### 5. Carry-over (from the notes)
- 5a. steps/each semantics ✅ DECIDED — `each` on the step; loop-step has an
  interleaved body. Record in the notes.
- 5b. Ops namespace ✅ DECIDED — tier-generic core + per-tier CLI;
  tier schema = code mechanism + config fields; anchored.yml = base dependency
  (merge default+user, loaded at bootstrap). Record in the notes.

## All items done ✅ — next step: "Plan forward" (set up impl-epic-layer anew)

## Proposed order

1 → 4 (clarify UX/behavior) … then 2 + 3 (execution + architecture, they hang
together) … then 5 (detail semantics). Order adjustable.
