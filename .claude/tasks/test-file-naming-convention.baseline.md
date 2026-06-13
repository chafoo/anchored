# Test-File-Naming Migration — Pre-Migration Baseline

Captured in phase `configure-runner-and-build` (before any file rename), so the
next (migration) phase can diff the post-rename state against this durable record.
**RE-GROUNDED 2026-06-13** after a concurrent `remove-headless-engine-path` task
deleted 8 engine test files and restructured the tree mid-build — the original
plan's "47 files / 38-5-4" premise is STALE; the numbers below supersede it.

## Discovery mechanism (verified, bun 1.3.14)

Bun's built-in matcher only recognizes `.test` / `_test_` / `.spec` / `_spec_` in
a filename. No bunfig key widens it; a bare glob arg is treated as a name filter.
The reliable way to run `*.e2e.ts` / `*.int.ts` is an explicit `./`-prefixed path.
The npm scripts collect those via `find ... | sed 's|^|./|'` and pass them to bun.

## Pre-migration baseline (command output)

`find src -name '*.spec.ts' -o -name '*.test.ts'` from `core/`:

- count of executed test files BEFORE any rename: **39**
- suffix distribution: `*.spec.ts` = 39, `*.test.ts` = 0, `*.e2e.ts` = 0, `*.int.ts` = 0
- `bun test` (default discovery): Ran 210 tests across 39 files, 0 fail

### Full baseline file set (39 paths)

```
./src/cli/cli.e2e.spec.ts
./src/cli/cli.spec.ts
./src/cli/commands/node/node.spec.ts
./src/cli/commands/plan/classify.spec.ts
./src/cli/custom-field-e2e.spec.ts
./src/cli/epic-tier.spec.ts
./src/cli/stage.spec.ts
./src/config/bootstrap.spec.ts
./src/config/default-file.spec.ts
./src/config/init.spec.ts
./src/config/merge.spec.ts
./src/config/override.spec.ts
./src/e2e/archive-reset.e2e.spec.ts
./src/e2e/e2e.dogfood.spec.ts
./src/e2e/epic-tier.e2e.spec.ts
./src/e2e/extensibility-matrix.spec.ts
./src/e2e/lifecycle-e2e.spec.ts
./src/e2e/skeleton.spec.ts
./src/engine/scope/resolve-steps/resolve-injection.spec.ts
./src/engine/scope/resolve-steps/resolve-steps.spec.ts
./src/index.spec.ts
./src/io/io.spec.ts
./src/ops/facade/facade.archive-reset.spec.ts
./src/ops/node-ops/node-ops.spec.ts
./src/ops/node-ops/tier-generic.spec.ts
./src/ops/scope/children/children.spec.ts
./src/ops/scope/questions/questions-log.spec.ts
./src/ops/scope/worker-dispatch/worker-dispatch.spec.ts
./src/ops/steps-planner/steps-planner.spec.ts
./src/ops/validate/validate.spec.ts
./src/parser/parse/parse.spec.ts
./src/parser/render/render.spec.ts
./src/parser/roundtrip.spec.ts
./src/schema/config/config.spec.ts
./src/schema/custom-fields/custom-fields.spec.ts
./src/schema/step/step.spec.ts
./src/schema/tiers/tiers.spec.ts
./src/state/invariants/invariants.spec.ts
./src/state/transitions/transitions.spec.ts
```

## Migration mapping (RE-GROUNDED — 8 renames + 1 relocation; src/e2e/ dissolved per q3)

TRUE e2e → `*.e2e.ts` (real fs/spawn — confirm by reading each before rename):
- ./src/cli/cli.e2e.spec.ts            → cli/cli.e2e.ts
- ./src/cli/custom-field-e2e.spec.ts   → cli/custom-field.e2e.ts
- ./src/e2e/epic-tier.e2e.spec.ts      → colocate by subject → epic-tier.e2e.ts
- ./src/e2e/e2e.dogfood.spec.ts        → cross-cutting → nearest entry-point → dogfood.e2e.ts

Integration → `*.int.ts` (full chain but in-memory, no real fs/spawn):
- ./src/e2e/lifecycle-e2e.spec.ts        → lifecycle.int.ts
- ./src/e2e/extensibility-matrix.spec.ts → extensibility-matrix.int.ts
- ./src/cli/epic-tier.spec.ts            → cli/epic-tier.int.ts
- ./src/e2e/archive-reset.e2e.spec.ts    → archive-reset.int.ts  (NAMED .e2e but IN-MEMORY fake-io harness → reclassified .int)

Unit smoke → stays `*.spec.ts`, relocated out of dissolving src/e2e/:
- ./src/e2e/skeleton.spec.ts             → out of e2e/ → skeleton.spec.ts near package root

No action (deleted by the concurrent task; were original plan targets):
- src/engine/integration.spec.ts          (gone)
- src/cli/commands/lifecycle.e2e.spec.ts  (gone)

## Target post-migration distribution (RE-GROUNDED, supersedes the stale 38/5/4)

- `*.spec.ts` = 31   (39 − 8 renamed; skeleton stays spec, just relocated)
- `*.e2e.ts`  = 4
- `*.int.ts`  = 4
- total       = 39   (name-set must map 1:1 to the pre-migration 39 paths)

## Gate (name-set / suffix-distribution diff, per q7/q10)

Post-migration, assert: the exact set of 39 executed test-file paths still runs
(8 renamed old→new, 1 relocated same-suffix, 30 unchanged) AND the per-suffix
distribution equals 31 / 4 / 4. A raw count is insufficient — git mv preserves
the total by construction.
