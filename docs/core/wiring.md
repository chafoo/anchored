← [core](_core.md)

# wiring (Composition-Root)

The **composition** of the package — two files, one hard dividing line: `index.ts` is
the **pure wiring factory** (no effect), `bin.ts` is the **only effect site**
(`process.*`, `node:fs`, `crypto`, top-level `await`). `bin.ts` wires the real
Node effects into `createAnchored` and drives the CLI — that is precisely what keeps
`index.ts` pure and thus fakeable.

## What

- **`index.ts` — `createAnchored(deps) → { cli, engine, ops, config }`:** bootstraps
  the merged config **exactly once** (base dependency) and wires the substrate
  in **deps-graph order**: `parser/render/io → ops → engine → cli`. No
  top-level side effect, no classes, no runtime access. Every effect (fs, yaml,
  spawn, merge) comes through an injected seam → the whole graph is fakeable
  (wiring tests inject spy sub-factories via `deps.wiring`).
- **`buildCli(WireDeps)`:** the leaner slug facade + cli wiring for the
  e2e harness (engine optionally stubbed).
- **`bin.ts`:** builds the real `io`/`fs`/`lock`/`rand`/`pid` effects, calls
  [`createInit(...).ensure(root)`](config/init.md) (lazy-init) **before**
  `createAnchored`, then `anchored.cli.run(process.argv.slice(2))` → `process.exit`.
  Shebang `#!/usr/bin/env node` (Node compatibility, no `Bun.*`).

## How

```mermaid
flowchart TB
    subgraph bin["bin.ts · only effect site"]
        fx["node:fs · crypto · process.*"] --> init["createInit().ensure(root)"]
        init --> ca["createAnchored(deps)"]
    end
    subgraph idx["index.ts · pure factory"]
        boot["bootstrap.load → config (1×)"] --> ops["buildSubstrate → node-ops + facade"]
        ops --> eng["createEngine (ops injected)"]
        eng --> cli["createCli (engine + ops injected)"]
    end
    ca --> boot
    cli --> run["cli.run(argv) → exit-code"]
```

Order is a contract: config first, then substrate → ops → engine → cli; each
stage is fed the previous one as a dep. `createAnchoredFn` overrides
(`merge`/`createNodeOps`/`createEngine`/`createCli`) allow spy injection.

## Why

Makes the top-level architecture principle concrete: [Factory-Functions](../../.claude/rules/factory-functions.md)
everywhere, effects behind seams. By isolating **all** `process.*`/`fs`/top-level-await in
`bin.ts`, `index.ts` stays a deterministic, fully
fakeable graph — the foundation that lets [engine-ops](ops/engine-ops.md) and
[facade](ops/facade.md) carry their await glue, while `index.ts` may not.
