← [anchored](../_anchored.md)

# core

The CLI package — the **deterministic** half of anchored. Loads the config,
resolves the config-driven step plans, mutates the node files atomically, and
enforces the integrity invariant. It exposes the lifecycle as CLI verbs; the
in-session skill orchestrates `plan → refine → build → wrap` over them (the
headless engine-run chain was removed — a `claude -p` subprocess can not reach
the session's Task tool).

```mermaid
flowchart TB
    cli["cli · anchored &lt;verb&gt;"] --> config["config · anchored.yml bootstrap"]
    cli --> ops["ops · node-ops + steps-planner"]
    config --> ops
    ops --> engine["engine · resolve-steps"]
    ops --> schema["schema · step/config/tiers"]
    ops --> state["state · transitions + invariant"]
    ops --> parser["parser · YAML ↔ node"]
    parser --> io["io · atomic-write"]
```

| Area | Responsibility (scope boundary) |
|---|---|
| [config](config/_config.md) | Bootstrap of the base dependency: `merge(default-template, user anchored.yml)` → `effectiveConfig`, once at startup. |
| [engine](engine/_engine.md) | The surviving step-resolution logic (`resolve-steps`) the steps-planner consumes — inserts the built-in defaults and enforces their canonical order. |
| [ops](ops/_ops.md) | Tier-generic op core: create/read/status/children/questions/log over *any* node, plus the steps-planner + worker roster. |
| [schema](schema/_schema.md) | Zod schemas: step grammar, `anchored.yml`, tier descriptors. |
| [state](state/_state.md) | State machine (forward-only) + the **hard invariant** (no `done` without `evidence`). |
| [parser](parser/_parser.md) | YAML ↔ node (two parse profiles), block-scalar render + schema directive. |
| [io](io.md) | `atomic-write` (lock + mkdir + POSIX rename). Single file. |
| [cli](cli/_cli.md) | The `anchored` command — sole transport (no MCP). `plan/refine/build/wrap` (return the resolved plan) + generic node verbs. |
| [wiring](wiring.md) | Composition root: `index.ts` (pure factory `createAnchored`) + `bin.ts` (sole effect site). Wires the substrate in deps-graph order. |

> **YAGNI**: The module pages reflect the **already decided** design
> (worked in from [docs/design/](../design/)) — only as deep as settled.
> Deeper implementation details (micro: schemas, signatures, enums) follow **with the code**,
> not pre-built.
