# Task-file schema — v2 (YAML)

The on-disk format for `.claude/tasks/<slug>.yml`. This document is
the human-readable spec; the machine-readable spec is the Zod schema
at `mcp/src/schema/task-file-v2.ts` and its derived JSON Schema at
`dist/schema/task-file-v2.schema.json`. The two MUST stay in sync —
when in doubt, the Zod schema wins.

## Why YAML

v0.1 used custom markdown with line-based regex parsing. Two bug
classes shipped (missing H1 → manual recovery; multi-line evidence
→ silent AC loss). Both are structurally impossible in v2 — the
`yaml` package handles edge cases the regex parser missed.

The mental model is the same one used by Kubernetes manifests,
GitHub Actions workflows, Ansible playbooks, GitLab CI configs, and
docker-compose: **structured workflow definition with embedded
prose**. Markdown content (context intro, plan notes, evidence
strings) still works — it lives inside YAML string values, with `|`
block scalars preserving multi-line content verbatim.

## Full structure

```yaml
schema_version: 2                    # literal; v2-only parser refuses other values
slug: <kebab-case>                   # filename slug (matches <slug>.yml)
status: plan | build | wrap | done   # next-action lifecycle marker
created: YYYY-MM-DD                  # ISO date, set on creation, immutable
title: <Title Case sentence>         # human-readable, can be edited freely

context:
  intro: |                           # 3-8 sentences typical, multi-line via |
    Why this task exists, what relevant code already exists,
    what's missing that this task adds.

  plan: |                            # optional — populated by /impl-plan
    - decision: chose Map over Object for TTL perf
    - decision: in-memory store for V1; Redis as V2
    - Q: should we delete tasks on completion?
      → resolved: no, mark done but keep them visible
    - Q: [blocking] which storage backend?
      → resolved: in-memory for V1 (confirmed by user, 2026-05-26)

  build:                             # optional — populated by /impl-build
    Implement: |                     # H4 sub-section per writing agent
      - phase-one / Token Storage Layer
        switched libraries mid-flight (factory.md pattern required it)
    task-validate: |
      - phase-one / Phase One (attempt 1)
        verdict: pass — 4 of 4 ACs accepted, 0 rejected
    code-validate: |
      - phase-one / Phase One (attempt 1)
        verdict: pass — 4 ACs clean, 0 with block findings
    # any user-custom agent can append its own sub-section here
    # — yaml record keyed by H4 name

  wrap:                              # optional — populated by /impl-wrap
    intro: |                         # TL;DR prose, optional
      Shipped 4 phases done / 0 blocked / 0 deferred.
      18 ACs with concrete evidence.
    subsections:                     # optional — H4 sub-sections under wrap
      review: |
        All clear — no findings from /review.

phases:                              # array, 2-6 typical
  - name: <Phase Name>               # Title Case, unique within task
    slug: <kebab-case>               # internal addressing, never user-facing
    status: pending | in-progress | done | blocked | deferred
    context: |                       # optional — phase-specific briefing
      Implements src/auth/store.ts as the generic key-value
      store with TTL. Used by phases 2 and 3 downstream.
    rules:                           # optional — must-follow rules for THIS phase
      - path: .claude/rules/_pattern/factory.md
        why: this phase adds a new module in src/services/
    acceptance_criteria:             # required, 2-6 typical, each testable
      - text: token-store interface defined in src/auth/store.ts
        evidence: —                  # em-dash sentinel until /impl-build fills
      - text: in-memory impl with TTL eviction
        evidence: |
          src/auth/store.ts:42 — MemoryStore class
          tests at src/auth/store.test.ts (8/8 green via pnpm test)
    # passthrough — extension fields declared in anchored.yml.task.phase.fields
    # land as flat top-level keys on the phase (no `extensions:` envelope)
    commit: abc1234                  # only if `commit` is declared
    coverage_pct: 87                 # only if `coverage_pct` is declared

# optional — preserved verbatim, never modified by anchored
customSections:
  notes: |
    Free-form section the user maintains by hand.
```

## Field reference

### Top-level

| Field            | Type                                  | Required | Notes                                                              |
|------------------|---------------------------------------|----------|--------------------------------------------------------------------|
| `schema_version` | `2` (literal)                         | yes      | Format gate. Parser refuses anything else.                         |
| `slug`           | kebab-case string                     | yes      | Matches the filename `<slug>.yml`. Immutable.                      |
| `status`         | `plan | build | wrap | done`          | yes      | Next-action marker. Forward-only transitions.                      |
| `created`        | ISO date `YYYY-MM-DD`                 | yes      | Set on creation. Immutable.                                        |
| `title`          | non-empty string                      | yes      | Human-readable. Can be edited freely.                              |
| `context`        | `ContextSection` (see below)          | yes      | Holds intro + plan/build/wrap sub-sections.                        |
| `phases`         | array of `Phase` (see below)          | yes      | 2-6 typical. Each represents one commit-ship-able unit of work.    |
| `customSections` | record of name → markdown string      | no       | User-maintained free-form sections. Preserved verbatim, untouched. |

### `context`

| Field        | Type                              | Required | Written by                                                          |
|--------------|-----------------------------------|----------|---------------------------------------------------------------------|
| `intro`      | string                            | yes      | plan agent during /impl-plan                                        |
| `plan`       | string                            | no       | plan agent (decisions, Q&A trace); orchestrator (Q&A resolutions)   |
| `build`      | record of subsection → string     | no       | implement / task-validate / code-validate / custom agents           |
| `wrap`       | `{ intro?, subsections? }`        | no       | /impl-wrap orchestrator                                             |

Build sub-sections by convention:
- `Implement` — per-phase decisions / notes from implement-agent
- `task-validate` — per-phase rollups (one line per attempt) from task-validate
- `code-validate` — per-phase rollups (one line per attempt) from code-validate
- Any other key — for user-custom agents (record is open-keyed)

### `phases[]`

| Field                  | Type                                                    | Required | Notes                                                                                                                          |
|------------------------|---------------------------------------------------------|----------|--------------------------------------------------------------------------------------------------------------------------------|
| `name`                 | string                                                  | yes      | Title Case. Unique within the task. User-facing in chat + commits.                                                            |
| `slug`                 | kebab-case string                                       | yes      | Internal addressing for service-layer ops. Never user-facing.                                                                  |
| `status`               | `pending | in-progress | done | blocked | deferred`     | yes      | State-machine — see transitions below.                                                                                         |
| `context`              | string                                                  | no       | Per-phase briefing. Omit if task-level Context covers it.                                                                      |
| `rules`                | array of `{ path, why }`                                | no       | Per-phase must-follow rules. Distributed by plan-agent from rules-agent output.                                                |
| `acceptance_criteria`  | array of `{ text, evidence }` (min 1)                   | yes      | Each AC is one testable sentence + evidence string.                                                                            |
| extension fields       | passthrough top-level keys                              | no       | Declared in `anchored.yml.task.phase.fields`. Lands as flat keys (no `extensions:` envelope). Validated against declared type. |

### `acceptance_criteria[]`

| Field      | Type   | Notes                                                                                                                                                                                  |
|------------|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `text`     | string | One testable sentence. Concrete subject + behavior. Avoid compound ANDs.                                                                                                               |
| `evidence` | string | Either the em-dash sentinel `"—"` (unfilled) or a concrete reference (file:line, command + outcome, test name + result, commit SHA). Service-layer rejects writes with embedded newlines. |

## State machine

### Task status

```
plan → build → wrap → done
```

- Forward-only. `task.status.set("plan")` from `build` is illegal.
- Stay-in-place transitions (X → X) are idempotent no-ops (allowed).
- `build → wrap` requires every phase to be terminal
  (`done | blocked | deferred`). The service-layer throws
  `IncompletePhases` otherwise.

### Phase status

```
pending → in-progress → done | blocked | deferred
                  ↑              ↓
                  └──── blocked (retry path) ←──
```

- `pending → in-progress` — start work on the phase
- `pending → deferred` — explicitly defer without working
- `in-progress → done` — service-layer rejects unless every AC has
  non-sentinel evidence (`IncompleteEvidence`)
- `in-progress → blocked` — work attempted but couldn't finish
- `blocked → in-progress` / `blocked → pending` — retry path

`done` and `deferred` are terminal — no transitions out.

## Service-layer enforcement (USP)

The on-disk file is mutated exclusively through service-layer ops
(MCP tools `mcp__task__*` for agents, `anchored` CLI for shells).
The service-layer enforces:

| Gate                                      | Op                              | Throws                |
|-------------------------------------------|---------------------------------|-----------------------|
| Forward-only task lifecycle               | `task.status.set`               | `InvalidTransition`   |
| Valid phase lifecycle                     | `phase.status.set`              | `InvalidTransition`   |
| Phase done ⇔ all ACs have real evidence   | `phase.status.set("done")`      | `IncompleteEvidence`  |
| Task wrap ⇔ all phases terminal           | `task.status.set("wrap")`       | `IncompletePhases`    |
| Evidence non-empty, no newlines           | `ac.evidence.set`               | `InvalidEvidence`     |
| AC index in range                         | `ac.evidence.set`               | `OutOfRange`          |
| Phase extension declared in anchored.yml  | `phase.field.set`               | `UnknownField`        |
| Extension value matches declared type     | `phase.field.set`               | `InvalidFieldType`    |

**Zero bootstrap exceptions** — see
`plugin/references/state-mutations.md`. Every mutation, including the
initial creation of a task-file by plan-agent and the Q&A
resolutions during /impl-plan, goes through the MCP factory. No
agent in `plugin/agents/*` has `Write` or `Edit` in its
frontmatter (enforced by the
`mcp/tests/agent-frontmatter.test.ts` test).

## IDE validation

Point your editor's `yaml-language-server` at the published JSON
Schema for real-time validation while editing task-files by hand:

```yaml
# yaml-language-server: $schema=./dist/schema/task-file-v2.schema.json
```

The schema is exported on every build and lives in
`@chaafoo/anchored-mcp/dist/schema/task-file-v2.schema.json` (path adjusted
for your install location). When the plugin is installed via
marketplace, this resolves to the global node_modules location.

## Migrating from v1

Run `anchored migrate <slug>` to convert a v1 `.md` task-file to a
v2 `.yml` task-file. The command is idempotent (re-runs on already-
converted files are safe no-ops). Use `anchored migrate --all` to
convert every `.md` file under `.claude/tasks/` in one pass.

Migration preserves: frontmatter (slug, status, created), title,
context sub-sections (intro, plan, build H4 sub-sections, wrap intro
+ sub-sections), phases (name, slug, status, optional context,
optional rules, acceptance_criteria with text + evidence), and
extension fields (commit, coverage_pct, etc.) — these last flatten
from v1's `extensions:` envelope to v2's top-level passthrough keys.
