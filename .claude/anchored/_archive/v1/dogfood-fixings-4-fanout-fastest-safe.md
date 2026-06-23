# Ticket: dogfood-fixings-4 — Fan-out: the fastest *safe* path as default

**Source:** conversation after the hardening. Observation: the executor decision is
conservative-default-sequential → the fan-out practically never fires (both dogfoods
ran fully sequential even though the mechanism is there).

## Guiding principle (from the user)
**Speed is the default wherever it's safe. The barrier protects ONLY correctness, never
quality.** The only real quality/behavior difference between parallel and sequential
is: sequential lands the phases one after another (the user can sort of watch along),
parallel lands them together. Nothing else.

## Solution: flip the default + user preference in refine
Today: conservative → sequential, except when obviously independent.
New: **fastest safe path → parallel; sequential only as a deliberate choice or
when unsure.**

- **Safety floor (hard, never negotiable — correctness):** parallel only when
  the acceptance criteria are truly independent (none touches another, no two touch the same
  file region). Otherwise they race → corruption. Frame clearly as correctness, NOT
  as speed-vs-quality.
- **Within "safe" → default = `workflow`** (fastest path), no longer
  conservative-sequential.
- **User preference, asked once in refine** (like the walk-style, ephemeral):
  *"Where it's safe — as fast as possible (parallel) or rather sequential,
  so you can watch along? Pure speed vs. watching — the quality is
  identical."* Default: as fast as safe.
- **Safe even on a misjudgment:** run every fan-out worker in
  **git worktree isolation** — then a wrong independence judgment corrupts nothing
  (the states only merge), and the compare-and-swap/lock (Harden-2/M4) catches the
  rest. That keeps "fastest path" robust against the AI judgment.

## Affected
- `refine/SKILL.md` "Decide the per-phase executor": flip the default + the
  speed-vs-watching preference (one-time, ephemeral, explicitly "never a quality
  decision").
- `build/SKILL.md`: fan-out workers under worktree isolation (phase AND task level);
  the worktree caveat turns from a caveat into a requirement.
- possibly `communication-style.md`: the "speed vs. watching, quality identical" framing.

## Acceptance
- a1: Refine picks `workflow` as soon as the safety floor (independent acceptance criteria)
  passes — the default is speed, not conservatism.
- a2: Refine asks the speed-vs-watching preference once; prose makes clear that
  this is NEVER a quality decision (only watchability).
- a3: Fan-out workers run under git worktree isolation (documented + in the
  build-SKILL as a requirement, not an option).
- a4: Grep test secures the wiring; the safety floor remains as a
  correctness barrier.
