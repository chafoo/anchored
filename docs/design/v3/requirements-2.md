# anchored v3 — requirements v2: the CLI as pure orchestrators

> A SECOND iteration on top of `requirements.md`. The four-layer model from v1
> (`lib → modules → services → cli`, the core inversion, the condition bundle, the
> universal invariant, 100% coverage) **still holds unchanged**. This document
> refines ONE thing: the **internal structure of `cli/`**. The shipped `cli/` (with
> `node-router/`, `tier-of/`, `commands/{stage,node,lifecycle}/`) is v2 ballast that
> got carried over 1:1 during the reshape — it is NOT the target. This is the target.

## The goal

`createCli(anchored.yml)` builds the **whole** CLI — the API surface is *assembled*
from config + the tier conditions, not hand-coded. Today the surface is hardcoded in
two places (the `switch` in `cli.ts` + the ~200-LOC sub-dispatch in `node.ts`) plus a
345-LOC forwarding facade. That means *we* build the CLI by hand, not the config.

## The principle: `cli/` holds ONLY orchestrators

- `cli/` contains **orchestrators and nothing else**. The moment a part of an
  orchestrator gets too big, it splits into its own file (a partial orchestrator, or
  a `scope/` helper) — but it stays an orchestrator.
- **Mechanism → `services/`** (the generic store/config — tier-agnostic).
- **Small pure helpers → `lib/utils/`** (envelope, arg-parsing, predicates).
- Substantial helpers that are real capabilities → `services/`.

## The key realization: the orchestration axis is the TIER (stage = verbs within it)

Every CLI command is the same shape at its core: **`slug → derive tier → do X`.** So
there is essentially ONE orchestrator axis — the **tier**. A "stage" is not a separate
orchestrator; it is just a **group of verbs inside the tier orchestrator**.

```ts
// cli/tier.ts — THE orchestrator. One generic factory, called 4× (phase/task/epic/project),
// each fed its pure condition bundle — exactly like createNodeOps today.
createTier(condition, { nodeOps, config }) → {
  // stage verbs (config-driven): return the orchestration PLAN for the in-session skill
  plan(), refine(), build(), wrap(), steps(),
  // node verbs (condition-driven): mutate via the generic store
  read(), setStatus(), addAc(), addEvidence(), setChildStatus(), setField(), …
  // lifecycle (file-only)
  archive(), reset(),
}
```

`createCli` then wires one `createTier` per condition and dispatches
`argv → tierOf(slug) → tier[verb]`. The stage verbs need a tier to mean anything, so
folding them into the tier orchestrator (vs a separate `createStage`) saves a file and
keeps the model coherent.

## Target `cli/` tree

```
cli/
├── cli.ts          # createCli(config, deps): THE main factory — imports conditions (modules) +
│                   #   store/config (services), builds 1 createTier per condition, dispatches
│                   #   argv → tierOf(slug) → tier[verb], emits the JSON envelope, help/version/validate.
│                   #   (createAnchored merges in here — createCli IS the assembly; bin.ts injects effects.)
├── tier.ts         # createTier(condition, { nodeOps, config }) → the full per-tier surface
│                   #   (stage + node + lifecycle verbs). THE orchestrator. Too big → tier/scope/{stage,verbs}.ts.
├── cli.spec.ts     # unit-tests the cli functions (faked deps)
└── cli.e2e.ts      # drives the WHOLE thing against real fixtures (test/epic.yml, task.yml) — writes real files
```

## What leaves `cli/` (and where it goes)

| today in cli/ | what it really is | new home |
|---|---|---|
| `node-router/` (345 LOC) | generic verb mechanism + slug routing + arg-shaping | the mechanism is already `services/store` (createNodeOps); the routing/shaping **becomes `tier.ts`** |
| `tier-of/` | "which tier is this file" — reads the file shape (needs `io`) | **`services/store`** (store-routing concern) |
| `commands/stage/classify` | tier tripwire (pure) | **`lib/utils`** |
| envelope (JSON serialize) · arg-parsing · `nextAcId` | pure helpers | **`lib/utils`** |
| `commands/{stage,node,lifecycle}/*` | the verb logic | **folds INTO `createTier`** as its verbs |

## The model end-to-end (unchanged layers, refined cli)

- **`modules/<tier>`** = pure condition (data).
- **`services/`** = generic mechanism (store · config), tier-agnostic, fed conditions.
- **`cli/`** = orchestrators only: `createTier(condition)` composes mechanism + condition
  into the per-tier verb surface; `createCli` wires every tier + dispatches.

## Open question (to confirm before building)

- **Stage = verb-group inside `createTier`, or its own `createStage(condition)` that
  `createTier` pulls in?** — Lean: verb-group inside the tier (one fewer file; a stage
  is meaningless without a tier). Confirm before the rebuild.

## Status

Design note only — agreed in discussion 2026-06-14, NOT yet built. The current `cli/`
still has the v2-shaped `node-router` + `commands/` tree. This is the spec for the next
`cli/` refactor; the `lib/modules/services` layers stay as shipped.
