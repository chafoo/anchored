---
slug: service-layer-architecture
status: draft
created: 2026-05-25
---

# Service-layer + MCP + CLI architecture

How anchored exposes state-mutation operations to agents, hooks, and
power-users. Two API layers — one typed for the immutable core, one
generic for the extension fields declared in `anchored.yml`.

**Hard rule:** the service-layer contains **zero integration-specific
code**. No git module, no jira module, no slack module, no coverage
module. Anchored provides storage + lifecycle + a stable mutation API.
Everything beyond that lives in user-defined shell steps and hooks in
`anchored.yml`.

---

## Two-layer API design

### Layer 1 — Typed core operations

Hard-coded operations for the immutable task-file core. Full type
safety. One method per concept. Used by built-in agents (plan, implement,
task-check, code-check) and by the orchestrator skills.

```
# Task lifecycle
task.create(slug, title, context)                       → void
task.status.set(slug, status)                           → void   # plan|build|wrap|done
task.status.get(slug)                                   → status

# Context sections (Plan / Build / Wrap sub-sections)
context.append(slug, section, text)                     → void   # section: plan|build|wrap
context.get(slug, section)                              → string

# Phases
phase.create(slug, phase_name, acceptance_criteria)     → void
phase.list(slug)                                        → Phase[]
phase.get(slug, phase_slug)                             → Phase
phase.next_pending(slug)                                → Phase | null
phase.status.set(slug, phase_slug, status)              → void
phase.transition(slug, phase_slug, from, to)            → void   # atomic guard-checked

# Acceptance criteria
ac.list(slug, phase_slug)                               → AC[]
ac.next_pending(slug, phase_slug)                       → AC | null   # next without evidence
ac.evidence.set(slug, phase_slug, index, text)          → void

# Read-only queries
task.read(slug)                                         → TaskFile   # full parsed structure
```

These ops know the core schema strictly. They validate enums, check
status transitions are legal, etc. They never touch user-defined fields.

### Layer 2 — Generic field operations

A small set of operations that work with any field declared in
`anchored.yml`. Schema-driven validation at runtime — service-layer
loads the user's anchored.yml and validates field-name + type before
mutating.

```
# Per-phase fields (declared in task.phase_fields)
phase.field.set(slug, phase_slug, field_name, value)    → void
phase.field.get(slug, phase_slug, field_name)           → value | null

# Task-level metadata (declared in task.metadata)
task.metadata.set(slug, field_name, value)              → void
task.metadata.get(slug, field_name)                     → value | null
```

Internal flow when `phase.field.set("oauth", "token-storage", "commit", "abc1234")` is called:

```
1. Load anchored.yml (cached, mtime-checked)
2. Look up "commit" in task.phase_fields
   → declared as { name: commit, type: string }    OK
3. Validate value "abc1234" against type string    OK
4. Parse task-file → mutate → render → atomic write
```

If the field is not declared → error with actionable message:

```
Field 'commit' is not declared in anchored.yml.
Add it to task.phase_fields:

  task:
    phase_fields:
      - { name: commit, type: string }
```

---

## Type system for extensions (V0.2 scope)

| YAML declaration                                          | Validates value as           |
|-----------------------------------------------------------|------------------------------|
| `{ name: <X>, type: string }`                             | any string                   |
| `{ name: <X>, type: number }`                             | parses as number (int/float) |
| `{ name: <X>, type: boolean }`                            | true/false/"true"/"false"    |
| `{ name: <X>, type: enum, values: [a, b, c] }`            | must be one of values        |

V0.3+ potential: `pattern: <regex>`, `default: <value>`, `nullable: true`.
Out of scope for V0.2.

Coercion rules:
- `string` accepts any input, stored as-is
- `number` tries to parse string input; errors on non-numeric
- `boolean` accepts `true|false|"true"|"false"|1|0`
- `enum` is strict — exact match against `values` list

---

## Frontend wrappers

The service-layer is pure functions. Two frontends wrap it for different
consumers:

### CLI

Single binary `anchored` with subcommands matching the API:

```
# Core ops
anchored task create <slug> --title "..." --context "..."
anchored task status set <slug> <status>
anchored context append <slug> <section> "..."
anchored phase create <slug> <phase-name> --acceptance ...
anchored phase next-pending <slug>                        # outputs phase slug or empty
anchored phase status set <slug> <phase-slug> <status>
anchored ac next-pending <slug> <phase-slug>              # outputs index or empty
anchored ac evidence set <slug> <phase-slug> <index> "..."

# Generic field ops
anchored phase field set <slug> <phase-slug> <field> <value>
anchored phase field get <slug> <phase-slug> <field>
anchored task metadata set <slug> <field> <value>
anchored task metadata get <slug> <field>
```

Used by:
- Shell-hooks in anchored.yml (`run:` steps)
- Power-users for manual inspection / debugging
- CI/CD scripts that need to query or update task state

### MCP

Fixed set of MCP tools, registered at server startup, independent of
how many custom fields the user has declared:

```
mcp__anchored__task_create
mcp__anchored__task_status_set
mcp__anchored__context_append
mcp__anchored__phase_create
mcp__anchored__phase_list
mcp__anchored__phase_next_pending
mcp__anchored__phase_status_set
mcp__anchored__phase_transition
mcp__anchored__ac_list
mcp__anchored__ac_next_pending
mcp__anchored__ac_evidence_set
mcp__anchored__phase_field_set       # generic, takes field_name + value
mcp__anchored__phase_field_get       # generic
mcp__anchored__task_metadata_set     # generic
mcp__anchored__task_metadata_get     # generic
mcp__anchored__task_read             # full parsed structure
```

Used by:
- Built-in agents (plan, implement, task-check, code-check) called from skills
- Anyone running anchored via Claude Code with MCP enabled

Tool descriptions are static. The generic field tools document themselves
as "writes any phase field declared in anchored.yml task.phase_fields;
validates against declared type."

---

## Folder layout

```
src/
├── schema/                ← parses anchored.yml + validates field declarations
│   ├── loader.ts          ← read + parse + cache (mtime-aware)
│   ├── types.ts           ← typed shape of anchored.yml
│   └── validator.ts       ← field-type validators for extension ops
├── parser/                ← task-file ↔ TaskFile data structure
│   ├── parse.ts           ← MD → TaskFile (core fields strict, extensions preserved as opaque)
│   ├── render.ts          ← TaskFile → MD (round-trip-safe)
│   └── types.ts           ← TaskFile, Phase, AcceptanceCriterion shapes
├── ops/
│   ├── core.ts            ← Layer 1: typed core operations
│   ├── field.ts           ← Layer 2: generic field operations (schema-driven)
│   └── atomic.ts          ← atomic file-write helpers (load → mutate → render → write)
├── cli/
│   ├── bin.ts             ← argv parser, dispatches to commands
│   └── commands/
│       ├── task.ts        ← `anchored task ...`
│       ├── phase.ts       ← `anchored phase ...`
│       ├── ac.ts          ← `anchored ac ...`
│       └── context.ts     ← `anchored context ...`
├── mcp/
│   └── server.ts          ← registers fixed-set of MCP tools, delegates to ops/
└── runner/                ← (added later, for skill orchestration)
    ├── pipeline.ts        ← runs steps from anchored.yml plan/build/wrap.steps
    └── hooks.ts           ← fires events to plan/build/wrap.on listeners
```

**What's deliberately not here:**

- ❌ `git.ts` — git is a user concern, lives in `run:` steps
- ❌ `jira.ts`, `slack.ts`, etc. — same reasoning
- ❌ `coverage.ts`, `test-runner.ts` — user shells out to their preferred tools
- ❌ any field-name-specific code (no `setCommit`, no `setCoveragePct`)

The service-layer is **storage + lifecycle + schema validation**. Nothing
else. Every integration-specific concern is expressed declaratively in
`anchored.yml` via shell steps.

---

## Parser extension behavior

The parser must be extension-aware: it knows core fields strictly,
preserves unknown fields as opaque key-value entries on round-trip.

```
TaskFile {
  slug, status, created           # core frontmatter
  metadata: Record<string, any>   # extension frontmatter, opaque to parser
  context: { plan, build, wrap }  # core body sections
  custom_sections: Record<string, string>  # extension sections, opaque
  phases: Phase[]
}

Phase {
  slug, name                      # core
  status                          # core
  context?                        # core (optional)
  acceptance_criteria: AC[]       # core
  fields: Record<string, any>     # extension phase fields, opaque
}

AC {
  text, evidence                  # core only — no extensions on AC level (V0.2)
}
```

Round-trip guarantee: anything in `metadata`, `custom_sections`, or
`phase.fields` survives every mutation cycle unchanged unless mutated
through field ops.

---

## Anchored.yml reload strategy

- **Read once** at first access, cache in memory
- **mtime check** on every subsequent access — re-read if mtime advanced
- **No file-watcher** — avoids inotify/fsevents complexity, mtime check is fast enough

This means: user changes anchored.yml mid-session, next op picks up the
new schema. No restart needed. No race conditions in single-process flow.

---

## What this enables

The two-layer API + zero-integration-code design means a user can add a
new "feature" (commit-tracking, jira-sync, coverage-recording, anything)
in two places in their `anchored.yml`:

1. Declare the field in `task.phase_fields` or `task.metadata`
2. Write a shell step (in `steps:` or `on:`) that runs their preferred
   tool and calls the generic CLI to persist the value

Anchored's source code is never touched. The same mechanism supports
arbitrary integrations without anchored knowing about any of them.

---

## Open questions for next discussion

1. **Validation timing** — does `phase.field.set` validate at call-time
   only, or also validate the full task-file on load (catch existing
   invalid data)? Probably both; details to settle.

2. **Concurrent write safety** — if two hooks fire simultaneously and
   both want to mutate the same task-file, what happens?
   Probably advisory file-lock at the atomic-write layer.

3. **CLI exit codes** — semantic codes for different error types
   (schema-violation vs file-not-found vs lifecycle-gate-violation)?
   Useful for shell-step error handling in user hooks.

4. **MCP tool list size** — we land at ~16 tools. Acceptable for
   Claude's context budget, but worth reviewing before V0.2 ship.

5. **Read ops in CLI** — output format for `phase next-pending` etc.
   Plain text? JSON with flag? Both?
