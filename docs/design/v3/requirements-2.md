# anchored v3 — requirements v2: modules are factories, the cli assembles them

> A SECOND iteration on top of `requirements.md`. The four-layer tree
> (`lib → modules → services → cli`), the contracts-as-seams rule, the universal
> evidence invariant, and 100% coverage **all still hold**. This document **supersedes
> two things** from v1:
> - `requirements.md` **rule 6** ("generic verb kernel fed pure-data conditions") — see
>   the trade-off below; and
> - the `createTier` idea from this file's first draft.
>
> The shipped code still has the v1 shape (pure condition bundles + a generic
> `createNodeOps` god-kernel + a `node-router`/`commands/` tree in `cli/`). That is the
> migration source, **not** the target. This document is the target.

## The goal

`createCli(deps)` builds the **whole** CLI by **assembling factories**: it instantiates
the generic services, then instantiates one **tier factory per module** — injecting each
the services it demands — and returns the clean assembled model. The API surface is the
union of what those factories expose; nothing is hand-coded in a `switch`.

## The model: every module is an active FACTORY (not pure data)

This is the core shift from v1. A `modules/<tier>` is **no longer pure data fed to a
generic kernel** — it is a **factory** that owns its tier's rules AND exposes its tier's
verbs, built on services it receives by dependency injection:

```ts
const epic = createEpic({ store, config })     // ← a factory, DI'd the services it demands
```

The rules of this model:

1. **A module is a factory `createX(deps) → Tier`.** It owns its condition (schema ·
   transitions · child relationship) as internal data AND the tier's verb surface
   (lifecycle · node · collection verbs). Its public surface is the verb API, not the
   raw condition.

2. **A module demands its dependencies by CONTRACT, never a concrete import.** `deps` is
   typed by `lib/contracts/` (`StorePort`, `ConfigPort`). The module imports only the
   *interface*; `createCli` injects the implementation. The inversion holds — a module
   still never imports a concrete service.

3. **A module may depend on another module — by contract.** The real case: epic's roll-up
   must read its child *task files*; rather than re-bind the store to task's schema, epic
   demands `task: Tier` in its `deps` and calls `task.get(childSlug)`. `createCli` injects
   it. Never a sibling concrete import — so the tiers compose without coupling, and epic
   need not know task's internals.

4. **The generic mechanism is a PRIMITIVE the factory builds on.** `services/store`
   exposes `StorePort.for(condition) → { read, mutate }` — the guarded read-modify-write
   (validate against the condition's schema · assert transitions · atomic write + CAS ·
   **the universal evidence invariant**). A module does `const ops = store.for(myCondition)`
   and writes its verbs as `ops.mutate(slug, transform)` with **pure tier-specific
   transforms**. Common CRUD delegates straight to `ops` (no duplication); tier-specific
   behaviour (epic roll-up, phase evidence-flip, stub-vs-AC) lives **in the tier factory**,
   not as `if (tier === …)` branches in one god-function.

5. **`validate` and `help` are modules too.** They are units in the same assembly,
   DI'd what they need (`config`; the tier factories for the live surface). `help` renders
   from the union of the tiers' verb surfaces — it can never drift from the real API.

6. **`cli/` is just assembly + routing.** `createCli` instantiates the services, then each
   tier factory (injecting deps), and returns the model. Dispatch is a **direct lookup**:
   the api.md grammar is tier-first (`anchored <tier> <verb> [slug]`), so
   `argv → modules[tier].run(verb, rest) → envelope`. No `node-router`, no file-shape
   derivation for routing (the tier is explicit in the grammar).

## What `createCli` looks like

```ts
// cli/cli.ts — instantiate services, then the tier factories (DI), return the model + route.
function createCli(deps) {                          // deps = the effect seams from bin.ts (io …)
  // ── services (generic mechanisms — know no tier) ──
  const store  = createStore({ io: deps.io, codec })  // implements StorePort: for(condition) → { read, mutate }
  const config = createConfig(deps).load(deps.root)   // implements ConfigPort: planFor · fields · raw

  // ── modules: each a factory, DI'd ONLY the contracts it demands (may demand another module) ──
  const phase   = createPhase({ store, config })
  const task    = createTask({ store, config })
  const epic    = createEpic({ store, config, task })    // epic reads child task files in roll-up — task injected
  const project = createProject({ store, config, epic })
  const validate = createValidate({ config, tiers: { phase, task, epic, project } })
  const help     = createHelp({ tiers: { phase, task, epic, project } })

  return { phase, task, epic, project, validate, help }   // the clean assembled model
  //  a thin dispatch wraps argv → modules[tier].run(verb, rest) → JSON envelope (bin.ts owns argv/exit).
}
```

## What a tier factory looks like

```ts
// modules/epic/epic.ts — a factory: owns the rules AND the verbs, built on injected services.
import type { StorePort }  from '../../lib/contracts/store.js'    // DEMANDS a store (contract, never concrete)
import type { ConfigPort } from '../../lib/contracts/config.js'
import { EpicSchema, epicTransitions } from './schema.js'         // the condition DATA stays internal, here

export function createEpic(deps: { store: StorePort; config: ConfigPort }) {
  const condition = { tier: 'epic', schema: EpicSchema, transitions: epicTransitions, childTier: 'task', … }
  const ops = deps.store.for(condition)             // bind the generic RMW primitive to epic's rules

  return {
    // lifecycle (config-driven plan)
    plan:   (input) => ({ node: …, steps: deps.config.planFor('epic', 'plan') }),
    // node verbs — delegate common CRUD to the bound ops (invariant enforced INSIDE mutate)
    get:    (slug)    => ops.read(slug),
    status: (slug, s) => ops.mutate(slug, (n) => ({ ...n, status: s })),
    // collection / tier-SPECIFIC verbs live HERE, encapsulated — not branches in a god-function
    childAdd: (slug, c) => ops.mutate(slug, addStub(c)),
    rollUp:   (slug)    => …,        // epic-only
  }
}
```

## What dissolves (vs the shipped v1 code)

| shipped (v1) | why it changes | new home |
|---|---|---|
| `modules/<tier>` = pure condition bundle | a module is now an active factory | `modules/<tier>/<tier>.ts` = `createX(deps) → Tier` (condition kept as internal data) |
| `services/store/node-store` (the generic god-kernel) | the per-verb transforms belong to the tier; only the RMW is generic | `services/store` keeps the generic `for(condition) → { read, mutate }`; the transforms move INTO the tier factories |
| `cli/node-router` (slug facade) | routing is a direct tier lookup now (tier-first grammar) | gone — `createCli` dispatch |
| `cli/tier-of` | not needed for routing (tier is explicit) | gone (or a guard in `services/store`) |
| `cli/commands/{stage,node,lifecycle}/*` | the verb logic belongs to the tier | folds INTO each `createX` |
| `createAnchored` (in `cli/anchored.ts`) | the assembly IS `createCli` | merged into `cli/cli.ts` |

## The one trade-off this resolves (supersedes rule 6)

`requirements.md` rule 6 chose a single generic verb kernel fed pure-data conditions. We
are reversing that: the tiers are **not** uniform (epic carries task-STUBS, phase carries
real ACs + evidence, epic/project roll up), so the generic kernel pays for its DRY-ness
with ugly `if (childTier === …)` branches in one ~600-LOC function. The factory model
keeps the genuinely-generic part (`store.for(condition)`: RMW + invariant) shared, and
**encapsulates each tier's specifics in its own factory** — delegating common CRUD to the
bound `ops` so there is no duplication. Better locality, the inversion intact.

## Status

Design note — agreed in discussion 2026-06-14, **not yet built**. The current `core/src`
still has the v1 pure-condition + generic-kernel + `node-router` shape. This is the spec
for the next refactor; `lib/` and the `services/config` + `services/store` *primitives*
stay, the tier behaviour moves into the module factories and `cli/` collapses to assembly.
