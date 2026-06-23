# Ticket: Harden-1 — Substrate + Security Quick-Wins (S-Tier)

**STATUS: DONE ✅** (247 tests green) — Q1 `status`/collections reserved
(set-field + set-child-field), Q2 hook absolute paths + dd/gawk/truncate/clobber +
opt-out only for Edit, Q3 built-in-worker-run guard, Q4 retry_limit≤20 + pipe-union
enum. All proven live. Hook documented as best-effort.


**Source:** 5-agent hardening review (harden-anchored-v2). This group = isolated,
low-risk single changes with the highest security-per-effort. All S.

## Findings + Fix

### Q1 — `set-field status done` bypasses evidence invariant + transitions  🔴 CRITICAL
`RESERVED_FIELDS` reserves only `executor` (`node-ops.ts:87`), so
`anchored node set-field <slug> status done` jumps a node plan→done WITHOUT evidence and
WITHOUT a transition check (bare `persist()`, `:169-184`). **Reproduced live.**
**Fix:** hard-reserve `status` (node + child + AC), or route every mutation of a
status-typed field through `assertTransition` + completability.
Regression test: `set-field status done` must throw `ReservedField`/`IllegalTransition`.

### Q2 — Bash hook lets an absolute-path redirect onto a task-file through  🔴
The `.claude/tasks` branch in `block-task-file-edits.js` has no leading-path
wildcard, so `echo x > /abs/.../.claude/tasks/foo.yml` (the most common
path form) passes through unblocked. **Reproduced live.**
**Fix:** give the `tasks` branch the same `[^\s'"|&;>]*` prefix as the `_epic`
branch; additionally pull in the next-most-common write shapes (`dd of=`, `truncate`,
`gawk -i inplace`, `write_text`, `fs.writeFile`). Test: absolute path
→ BLOCK.

### Q3 — User step re-declares a built-in worker with `run:` → shell escalation
merge keys steps by name, so `{name: implement, run: 'rm -rf /'}` is merged into the
privileged `implement` worker and reclassified by `toPlanStep` to `kind:run`
(`merge.ts:22-37`, `steps-planner.ts:21-44`). An injected
anchored.yml can run arbitrary shell on "implement".
**Fix:** in `mergeSteps`, reject with `ConfigError` when a user step hits a
built-in-worker name with a conflicting `run`/`use`/`each`. Test.

### Q4 — Small screws
- **`retry_limit` without an upper bound** (`schema/config.ts:18`): `1e9` accepted →
  loop hang via config. → `.max(20)`.
- **`ANCHORED_TASKFILE_EDIT=1` also switches off Bash** (`block-task-file-edits.js`):
  inherits into build agents and makes the whole enforcement switchable off. → honor
  the flag only for Write/Edit/MultiEdit, NEVER for Bash.
- **`zodForTypeString` fallback to `z.unknown()`** (`custom-fields.ts:29-35`): a
  declared non-scalar field validates arbitrary garbage. → reject unknown
  type strings fail-fast at bootstrap (does not touch the invariant, only
  sharpness).

### Docs
- Document the hook explicitly as **best-effort defence-in-depth** — the authoritative
  one is the validating CLI/persist, not the hook (an allowlist-of-shapes is structurally
  never gapless).

## Non-goal
- No flow/contract change. Pure hole-closing + sharpening.
