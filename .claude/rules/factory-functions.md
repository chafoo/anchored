# Rule: Factory-Function pattern everywhere

> Scope: all of `core/` (engine, substrate, ops, config) and every new piece of code.
> Non-negotiable. This is the top architecture principle of anchored v2.

## The rule

**Every module exports a factory function** of the form:

```ts
export function createX(cfg, deps) {
  // closure state here (if needed at all)
  return {
    run(input) { … },        // or named verbs for ops:
    // create(), read(), setStatus(), addChild(), …
  }
}
```

`createX(cfg, deps) → { run(input) → output }` (engine layers) or
`createX(cfg, deps) → { verb(args) → result }` (ops). Each layer has a
clear input/output contract.

## Always

- **Deps get injected** — `spawn`, `ops`, `parser`/`render`, `validate`/`state`,
  `config` come in as the `deps` argument. Never directly imported + called
  where they serve as an effect seam.
- **Swappable for fakes in tests** — `createStepRunner({ spawn: fakeSpawn, ops: fakeOps })`
  must be enough to test the layer without real CC/FS.
- **Deeper helpers in `scope/`** — every factory may have helpers in its `scope/` folder,
  also with a clear input/output (e.g. `engine/scope/loop-step.ts`).
- **`cfg` = the merged effectiveConfig** (or a part of it), loaded once at
  bootstrap and passed through.

## Never

- **No classes** for engine/ops/substrate logic. (Pure data types/Zod schemas
  are fine.)
- **No module-level singletons or top-level side effects** — no module that
  builds up state, touches the FS, or opens a connection on import.
- **No free-standing functions with hidden/global state.** Pure,
  stateless pure-helpers are fine; anything with state/effect belongs behind a factory.
- **No direct import of an effect dep** (spawn, fs-write) in deeply nested
  logic — it goes through the injected seam.

## Why

Testability (fake deps), swappability (spawn agent↔`claude -p`, transport
MCP↔CLI without touching the runner), extensibility (new step type = one file in
`scope/`). This is the trader pattern, applied consistently to the fractal
lifecycle. See `docs/design/engine-architecture.md`.

## Reference

`docs/design/engine-architecture.md` (both fractals, pseudo-TS).
[[fractal-substrate-integrity]] delineates what is mechanism (code) vs. policy
(config).
