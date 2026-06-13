# anchored v2

Fractal rewrite of [anchored](https://github.com/chafoo/anchored) — a pure
framework for AI-driven work across four self-similar tiers:

```
project ▸ epic ▸ task ▸ phase     (all: plan → refine → build → wrap)
```

Core principles (design settled, implementation beginning):

- **Fractal**: one lifecycle form on every tier; `build.each` is the recursion
  edge, `phase` the leaf.
- **Pure framework, no built-ins**: the behaviour lives in the default template
  (`anchored.default.yml`), active by default, fully overridable.
- **Integrity in the substrate**: no `ac` to `done` without `evidence` — the core
  value sits in the data model, not in a step.
- **CLI-only transport**: all ops through the `anchored` CLI via Bash (no MCP) —
  works in the main session *and* subagents/headless.
- **Factory engine**: `createX(cfg, deps) → { run(input) → output }`, `scope/`
  helpers; the engine is deterministic code, AI is an effect behind `spawn`.

## Where things live

- **`docs/design/`** — the binding design spec (from the v1 dogfood session):
  - `fractal-lifecycle.md` — the tier model + diagram
  - `anchored.default.yml` — the complete default config (steps + fields)
  - `engine-architecture.md` — the factory-function engine
  - `fractal-redesign-notes.md` — decision record (all items)
  - `agenda.md` — the walked-through question list
- **`core/`** — the CLI/engine package (TS) — *still empty, build to follow*
- **`plugin/`** — the Claude Code plugin (skills, agents, commands) — *still empty*

## Status

Design complete, implementation at the start. Plugin namespace: `a`
(commands `/a:plan|refine|build|wrap`). Build order: `pure-engine` →
`default-template` → `epic-tier`.
