# Ticket: Extensibility-Hardening — "extend arbitrarily without code", test-locked

**Motivation:** The core value is that users build extremely extensive `anchored.yml`
files (custom steps + fields in every tier/stage) WITHOUT touching framework code.
The dogfood revealed that this guarantee is not met consistently and is not
test-locked. On top of that, a validator is missing with which the setup skill (and
the user) can reliably check a yml.

## Findings (starting point)
- Custom-step dispatch exists only in **build + wrap** skills — NOT plan +
  refine (0 hits). "Web research in plan → research field" would not fire.
- **No `anchored validate`** — validation only implicit via `anchored steps`
  (throws ConfigError, currently crashes ungracefully via bootstrap).
- Custom fields work (F1) for task; not test-covered for phase/epic.
- No closed test matrix (custom step × tier×stage; custom field × tier).

## Status: D1–D4 ALL done ✅ (243 tests green)

- **D1 ✅** `anchored validate` — proven live (valid → full shape, invalid →
  clean error envelope instead of crash; bin.ts catches ConfigError). Unit:
  validate.spec. Setup skill uses it as the final check.
- **D2 ✅** plan + refine SKILLs now dispatch custom run/use steps + variable
  contract (previously 0 hits). Grep test.
- **D3 ✅** closed matrix: custom run-step + use-step in EVERY tier×stage
  (24 tests), custom field in phase/task/epic (3). extensibility-matrix.spec.
- **D4 ✅** extensive example yml `plugin/references/anchored.example-
  comprehensive.yml` (research→research field in plan, TDD-implement instruction,
  per-phase commit, custom steps in all 4 stages, custom fields per tier) —
  validated via `anchored validate` + locked in the test merged against defaults.

## Deliverables (original)
- **D1 — `anchored validate`**: loads + merges + validates the whole anchored.yml,
  resolves all tier×stage step plans, lists custom fields, reports precise errors
  (instead of a bootstrap crash). The verifier for the setup skill. + test.
- **D2 — plan + refine dispatch custom steps**: the SKILLs run `kind:'run'`/
  `kind:'use'` steps generically (like build/wrap), with a variable contract. This
  makes steps fire in ALL 4 stages. + grep test.
- **D3 — closed test matrix**: custom run-step resolves in every valid
  tier×stage; custom field writes/reads in phase/task/epic; end-to-end. + tests.
- **D4 — extensive example anchored.yml** as a fixture in anchored-v2: web
  research step in plan → `research` field, commit, and the ARCHITECTURE INSTRUCTION
  = **test-driven development** (every implement worker builds test-first: red → green → refactor; via
  `build.implement.instructions` or similar, passed through to the worker). Tested via
  `anchored validate` + steps plans.

## Setup skill
- After D1: the setup skill uses `anchored validate` as the final check (instead of just
  `anchored steps`).

## Enforcement context (already done, B5)
- The block-task-file-edits hook now also covers Bash writes.
