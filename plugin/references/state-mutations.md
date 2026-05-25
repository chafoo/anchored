# State mutations — service-layer API

Reference for the MCP tools and CLI commands that mutate the task-file.
**Every task-file mutation goes through this API.** No agent or skill
edits `.claude/tasks/<slug>.md` with Write/Edit directly — the
service-layer validates schema, enforces state-machine transitions,
and preserves user extensions on round-trip.

## Two frontends, one service-layer

| Frontend | Used by                                            | Format                                  |
|----------|----------------------------------------------------|-----------------------------------------|
| **MCP**  | Subagents (called as `mcp__anchored__<tool>` tools) | Typed JSON inputs/outputs               |
| **CLI**  | Shell hooks (`run:` steps in anchored.yml), humans  | `anchored <noun> <verb> <args...>`     |

Both wrap the same `src/ops/` core in `@anchored/mcp`. They diverge
only at the I/O boundary.

---

## Operations by domain

### Task-level

#### `task.read(slug)` → task data
- **MCP:** `mcp__anchored__task_read`
- **CLI:** `anchored task read <slug>`
- Returns the full parsed task-file (frontmatter, sections, phases).
- Read-only. Never modifies.

#### `task.status.set(slug, new_status)`
- **MCP:** `mcp__anchored__task_status_set`
- **CLI:** `anchored task status set <slug> <new_status>`
- Validates the transition is legal (e.g., `plan → build` OK, `plan
  → done` rejected).
- Throws `InvalidTransition` if illegal.

### Phase-level

#### `phase.next_pending(slug)` → phase or null
- **MCP:** `mcp__anchored__phase_next_pending`
- **CLI:** `anchored phase next-pending <slug>`
- Returns the next phase whose status is `pending` OR `in-progress`
  (in declaration order; in-progress comes first for resume-safety).
- Returns null if no such phase exists.

#### `phase.status.set(slug, phase_slug, new_status)`
- **MCP:** `mcp__anchored__phase_status_set`
- **CLI:** `anchored phase status set <slug> <phase_slug> <new_status>`
- Validates phase-status transition rules.
- Reserved transitions: `pending → in-progress → done | blocked | deferred`.

#### `phase.field.set(slug, phase_slug, field_name, value)`
- **MCP:** `mcp__anchored__phase_field_set`
- **CLI:** `anchored phase field set <slug> <phase_slug> <field_name> <value>`
- Generic field op for user-declared phase fields (from
  `anchored.yml.task.phase.fields`).
- Validates the field is declared + type matches.
- Used for: commit SHAs, coverage %, PR URLs, anything custom.

#### `phase.field.get(slug, phase_slug, field_name)` → value or null
- **MCP:** `mcp__anchored__phase_field_get`
- **CLI:** `anchored phase field get <slug> <phase_slug> <field_name>`
- Read-only.

### AC-level

#### `ac.list(slug, phase_slug)` → array of {text, evidence}
- **MCP:** `mcp__anchored__ac_list`
- **CLI:** `anchored ac list <slug> <phase_slug>`
- Returns all acceptance criteria for the phase with their current
  evidence strings (`"—"` for unfilled).

#### `ac.evidence.set(slug, phase_slug, ac_index, evidence_string)`
- **MCP:** `mcp__anchored__ac_evidence_set`
- **CLI:** `anchored ac evidence set <slug> <phase_slug> <ac_index> "<evidence>"`
- Sets the evidence for one AC.
- `ac_index` is 0-based.
- Rejects empty evidence strings (`""`, `"—"`, whitespace-only) —
  that defeats the USP. Use a real value or don't call.

### Context-level (the Markdown sections)

#### `context.append(slug, section, subsection, content)`
- **MCP:** `mcp__anchored__context_append`
- **CLI:** `anchored context append <slug> <section> [<subsection>] "<content>"`
- Appends content to a Context sub-section.
- `section` is one of: `Plan`, `Build`, `Wrap`.
- `subsection` is optional. If set, content goes under
  `### <section> → #### <subsection>` (H4 sub-section, created
  on-demand if it doesn't exist yet).
- Used by:
  - plan-agent → writes decisions + Q&A to `Plan` (no subsection)
  - implement-agent → writes mid-flight notes to `Build` /
    `Implement`
  - task-check → writes verdicts to `Build` / `task-check`
  - code-check → writes verdicts to `Build` / `code-check`
  - wrap.review step → writes findings to `Wrap` / `review`
  - wrap.summarize step → writes TL;DR to `Wrap` (no subsection)

---

## Validation guarantees

Every op runs through validation BEFORE writing:

1. **Schema validity.** Mutation must produce a task-file that
   still parses cleanly.
2. **Type checking.** Field values must match their declared types
   (especially `task.phase.fields` extensions — string vs number vs
   enum).
3. **Transition legality.** Status changes must follow the
   state-machine (no `plan → done` shortcuts).
4. **AC-index in range.** `ac.evidence.set(ac_index=99)` throws if
   the phase only has 4 ACs.
5. **Slug existence.** Operations on a nonexistent task slug or
   phase slug throw `NotFound`.

Failed validation throws a typed error. Callers (orchestrators,
agents) catch and react — typically by surfacing the error to the
user, never by trying to write past the validation.

---

## Round-trip safety

The parser preserves:
- Unknown frontmatter fields (forward compat)
- Unknown body sections at H2 level (`## My Custom Section`)
- Unknown H4 sub-sections under `### Build` or `### Wrap`
- User-declared `task.phase.fields` (preserved across mutations)
- HTML comments (used internally for phase slug IDs)
- Trailing whitespace conventions

This means: a user can hand-edit their task-file (e.g., add notes,
add a `## Risk Assessment` section), and anchored will not eat their
edits during subsequent mutations.

---

## CLI invocation patterns

For shell hooks in `anchored.yml`:

```yaml
build:
  commit: |
    Run `git add -A && git commit -m "feat($TASK_SLUG): $PHASE_NAME"`.
    Then: `anchored phase field set $TASK_SLUG $PHASE_SLUG commit "$(git rev-parse HEAD)"`.
```

Env vars available to `run:` blocks: `$TASK_SLUG`, `$PHASE_NAME`,
`$PHASE_SLUG`. The orchestrator sets these per phase.

For human ad-hoc use:

```bash
# Show what's pending
anchored phase next-pending my-task

# Manually mark a phase deferred
anchored phase status set my-task tricky-thing deferred

# Restart a phase (clear evidences, set pending)
# (No single op for this in V0.2 — edit the file by hand)
```

---

## What MCP doesn't do

- **No bulk operations.** Set evidence per AC, set status per phase.
  Loops happen at the orchestrator level.
- **No transactional batches.** Each call writes immediately. If you
  need atomicity for multiple changes, your orchestrator handles
  rollback (or you accept eventual consistency in the file).
- **No diff-against-history.** Once written, prior state isn't
  recoverable from the service-layer. Use git for history.
- **No locks.** Concurrent `/impl-*` calls on the same task-file can
  race. V0.2 doesn't handle this (advisory locks are V0.3+).
