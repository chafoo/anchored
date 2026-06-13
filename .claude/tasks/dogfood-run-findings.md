# Ticket: Findings from the first full epic dogfood with version-control customs (2026-06-12)

**Source:** Live run in anchored-test — `/a:setup` (version-control strategy) + full
epic lifecycle (`/a:plan` → `/a:refine` → `/a:build` → `/a:wrap`) on the
tasks app. Ran green end-to-end, but uncovered real gaps.

## Status of the old fixes (held?)

- **Core-value / honesty gate** — HELD, exemplary: task-validate correctly
  rejected a DOM acceptance criterion with a static code trace → forced a real
  browser E2E. Exactly what the gate is there for.
- **D1/D2 (epic lifecycle symmetry, per-task outcome acceptance criteria, roll-up)** —
  HELD: epic-decompose wrote 8 outcome acceptance criteria + 1 integration acceptance criterion (e1),
  epic-plan-check caught the spec error (#clear-completed actually missing), roll-up
  hard-validated 8/8 + e1.
- **H4 (failures-reset + clear-failures)** — LIVE OK (dist was stale in the first
  session → UnknownNodeVerb; present after rebuild). Lesson: dist must be
  rebuilt after every CLI change (npm-link points at core/dist).
- **Version-control customs (orchestrator run-steps)** — HELD: branch-per-task,
  commit-per-phase, merge-to-main (-X theirs) ran across the whole run.

## New findings

### F1 — Custom node fields not persistable at all  ✅ FIXED
`task.fields.commit_sha` is accepted by the config but NOT passed through into the strict
node schema → `set-field commit_sha` threw "Unrecognized key". The
user's core wish (commit SHA per task in a field) was thereby dead; the
orchestrator fell back to `append-log`.
**Fix:** `schema/custom-fields.ts` extends the tier schema (parser + persist)
with the declared custom fields; known fields keep their strict
typed check, undeclared keys remain rejected. Proven live + unit.

### F7 — config.md teaches the WRONG `fields` form  ✅ FIXED
Docs showed `fields: - { name: x, type: string }` (list), but the schema wants
a record (`x: string`). The setup skill first produced the list form →
schema error, had to fix it up.
**Fix:** config.md corrected to the record form + example.

### F3 — `anchored plan <tier> <desc>` makes ugly slugs out of the whole description  ✅ FIXED
The slug was derived from the full description text
(`tasks-app-aus-dem-leeren-vanilla-js-scaffold-ind`). The orchestrator had to
`rm` the node file multiple times and recreate it with a short description.
**Fix:** explicit slug as the first argument: `anchored plan <tier> <slug>
"<desc>"`.

### F2 — No CLI way to set `depends_on` (or a child field)  ✅ FIXED
`add-child` only took `<slug> [goal]`; `set-field tasks.1.depends_on` failed
(set-field does not index arrays). The dependency-graph edge had to be set via
`ANCHORED_TASKFILE_EDIT=1` direct edit — and a scaffold agent
falsely claimed it had set it.
**Fix:** `add-child` now takes `depends_on` (CSV 3rd arg); new verb
`set-child-field <slug> <child> <field> <value>` for child fields.

### F5 — `anchored --version` → 0.0.0  ✅ FIXED
Version was not wired from package.json.

### F8 — epic-scaffold agent reliability  ✅ FIXED (consequence of F2)
The agent reported a set dependency-graph edge that was not in the file, and did not use
the `goal`. With F2 (add-child takes depends_on) the agent gets the
real lever; epic-scaffold.md sharpens the instruction (set depends_on + goal,
then verify via read).

### F10 — `git add -A` in the phase-commit step sweeps in foreign untracked files  ✅ DOCS
The first phase commit would have swept in the untracked setup (anchored.yml, EPIC.md,
plan files); the orchestrator had to commit manually to main beforehand. Lesson
in config.md (version-control example) + the anchored.yml template.

### F9 — Machine vocabulary still leaks into the chat  ⏳ OBSERVED
"DAG", "next-child", "each:task loop", "gates", "ready-children", "executor"
showed up in the chat. The user did not object this time; H1/H2 mostly
hold. Low priority — further sharpening optional.

### F4 — dist staleness (first session: clear-failures UnknownNodeVerb)  ✅ NO BUG
The npm-linked CLI points at `core/dist` — after every CLI change,
`npm run build` must run, otherwise the live CLI is stale. Currently built + verified
(clear-failures live, all F1-F5 fixes in dist).

### F6 — Task node has no `goal` field  ⏳ OBSERVED (not fixed)
`set-field core-list goal …` threw "Unrecognized key". Uncritical: the child just-in-time
plan seeds from the outcome acceptance criteria, the goal lives in the stub + plan trail. Low
priority; intentionally not changed (redundant field).

## Eval (all fixes proven live)
- F1: commit_sha field end-to-end — live in anchored-test + in the full flow
  (branch → phase-commit → `set-field commit_sha` == HEAD ✓). Unit: 5 tests.
- F2: add-child depends_on + set-child-field + dependency-graph gating — integration: 1 test.
- F3: plan --slug → clean slug — integration: 1 test.
- F5: `anchored --version` → 0.1.0.
- merge-to-main: demonstrably ran through in the real dogfood run.
- All 5 gates green (208 tests). core dist rebuilt, plugin v0.1.7.

## Prep — anchored-test is ready to go for tomorrow ✅
- Scaffold baseline (app.js stub, index.html, style.css) restored.
- `anchored.yml`: full customs — branch-per-task, commit-per-phase **with
  a working commit_sha field** (F1), merge-to-main (-X theirs),
  slug-flatten guard. Validated live (3 stages parse, field writes).
- Run task-files moved into `_archive`; task branches deleted; only `main`.
- Baseline commit `9988ffb`. **Tomorrow: reinstall plugin v0.1.7 + /reload-plugins,
  then `/a:plan EPIC.md`.** (CLI is already live via npm-link + rebuild.)
