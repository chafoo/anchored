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

4. **The `store` service is dumb: read/write a node, validated by a schema you give it.**
   It is the ONE substrate service — `createStore({ fs, lock, yaml }) → { read(slug,
   schema), write(slug, node, schema), move, remove }`. It loads/persists a node *safely*
   (yaml ⇄ object via the `yaml` lib · atomic temp+rename under `lock` + compare-and-swap ·
   `fs` is the one effect) and validates against **the schema it is handed**. It knows
   **no tier, no evidence, no transition** — the schema is the law. There is no `io`/`codec`
   layer: `fs`/`lock`/`yaml` are injected seams, the rest is the store. A tier factory
   calls `store.write(slug, transform(node), mySchema)` with **pure tier-specific
   transforms**; common CRUD is trivial, tier-specific behaviour (epic roll-up, phase
   evidence-flip, stub-vs-AC) lives **in the factory**, never as `if (tier === …)` branches.

   - **The evidence invariant lives in the SCHEMA, not the service.** The
     `AcceptanceCriterion` fragment carries the Zod `.refine(ac => ac.status !== 'done' ||
     isEvidenceFilled(ac.evidence))` — defined ONCE in `modules/shared/schema.ts`, reused
     by every tier schema. Because `store.write` runs `schema.parse` on every write, the
     rule is unskippable *without the store knowing what evidence is*. (No `invariants`
     service file.)
   - **Transitions are a pure `lib` helper the module calls.** `assertTransition(map,
     from, to)` in `lib/utils`, the maps in `lib/constants`. Not the store's concern.

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
function createCli(deps) {                          // deps = the seams from bin.ts (fs · lock · yaml · readers)
  // ── services (generic mechanisms — know no tier) ──
  const store  = createStore({ fs: deps.fs, lock: deps.lock, yaml: deps.yaml })  // read/write a node, validated by a given schema
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
// modules/epic/epic.ts — a factory: owns the rules AND the verbs, built on the injected store.
import type { StorePort }  from '../../lib/contracts/store.js'    // DEMANDS a store (contract, never concrete)
import type { ConfigPort } from '../../lib/contracts/config.js'
import { assertTransition } from '../../lib/utils/assert-transition.js' // pure guard
import { lifecycleTransitions } from '../../lib/constants/transitions.js'
import { EpicSchema } from './schema.js'   // the tier's schema — carries the evidence refine; the law the store enforces

export function createEpic(deps: { store: StorePort; config: ConfigPort }) {
  const { store, config } = deps
  const read  = (slug)       => store.read(slug, EpicSchema)
  const write = (slug, node) => store.write(slug, node, EpicSchema)   // store runs schema.parse → evidence enforced

  return {
    // lifecycle (config-driven plan)
    plan:   (input) => ({ node: …, steps: config.planFor('epic', 'plan') }),
    // node verbs — trivial read/transform/write; the store + schema do the guarding
    get:    (slug)    => read(slug),
    status: async (slug, s) => {
      const node = await read(slug)
      assertTransition(lifecycleTransitions, node.status, s)          // pure guard, module's call
      return write(slug, { ...node, status: s })
    },
    // collection / tier-SPECIFIC verbs live HERE, encapsulated — not branches in a god-function
    childAdd: async (slug, c) => write(slug, addStub(await read(slug), c)),
    rollUp:   (slug)    => …,        // epic-only — reads child task files via deps.task
  }
}
```

## What dissolves (vs the shipped v1 code)

| shipped (v1) | why it changes | new home |
|---|---|---|
| `modules/<tier>` = pure condition bundle | a module is now an active factory | `modules/<tier>/<tier>.ts` = `createX(deps) → Tier` (schema kept as internal data) |
| `services/store/node-store` (the generic god-kernel) | the per-verb transforms belong to the tier | `services/store/store.ts` shrinks to `read(slug,schema)`/`write(slug,node,schema)`; the transforms move INTO the tier factories |
| `services/store/io` | the effect is just the filesystem | dissolved — `fs` + `lock` are injected seams into `createStore`; the atomic-write dance is store-internal |
| `services/store/codec` (parse/render) | yaml⇄object is just the `yaml` lib; the schema comes from the module | dissolved — `store` calls `yaml.parse`/`stringify` + the injected schema |
| `services/store/invariants` | the service must not know what evidence is | dissolved — the rule is a Zod `.refine` in `modules/shared/schema.ts` (the schema is the law) |
| `services/store/transitions` | a pure per-tier-data guard, not a service | `lib/utils/assert-transition.ts` + the maps in `lib/constants`; the module calls it |
| `services/store/{children,questions,log}` | pure transform helpers, no effect | `modules/shared/` (the modules' transform toolkit) |
| `services/store/validate` | a read-only config inspection | `modules/validate` (a module unit) |
| `cli/node-router` (slug facade) | routing is a direct tier lookup now (tier-first grammar) | gone — `createCli` dispatch |
| `cli/tier-of` | not needed for routing (tier is explicit) | gone |
| `cli/commands/{stage,node,lifecycle}/*` | the verb logic belongs to the tier | folds INTO each `createX` |
| `createAnchored` (in `cli/anchored.ts`) | the assembly IS `createCli` | merged into `cli/cli.ts` |

## The one trade-off this resolves (supersedes rule 6)

`requirements.md` rule 6 chose a single generic verb kernel fed pure-data conditions. We
are reversing that: the tiers are **not** uniform (epic carries task-STUBS, phase carries
real ACs + evidence, epic/project roll up), so the generic kernel pays for its DRY-ness
with ugly `if (tier === …)` branches in one ~600-LOC function. The factory model keeps the
genuinely-generic part (`store`: safe read/write validated by a schema) shared, and
**encapsulates each tier's specifics in its own factory** — common CRUD is a trivial
read/transform/write, so there is no duplication. Better locality, the inversion intact.
And because the only universal guard (evidence) lives in the *schema*, the store stays
dumb: it never learns what a tier is.

## Status

Design note — agreed in discussion 2026-06-14, **not yet built**. The current `core/src`
still has the v1 pure-condition + generic-kernel + `node-router` shape. This is the spec
for the next refactor; `lib/` and the `services/config` + `services/store` *primitives*
stay, the tier behaviour moves into the module factories and `cli/` collapses to assembly.
