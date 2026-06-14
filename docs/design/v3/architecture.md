# anchored v3 — code architecture

Companion to `api.md` (the CLI surface) and `requirements-2.md` (the binding model).
This is the **code layout** that mirrors the surface 1:1.

> **Shipped vs target.** The current `core/src` still has the v1 shape (pure condition
> bundles + a generic `createNodeOps` kernel + a `node-router`/`commands/` tree in `cli/`).
> **This document describes the TARGET** — the factory model from `requirements-2.md`. The
> `lib/` layer and the `services` *primitives* stay; the tier behaviour moves into module
> factories and `cli/` collapses to assembly. Sections below marked _(shipped)_ note where
> today's code differs.

## Principles

- **Everything is a factory function** — `createX(deps) → { … }`, a clear input (`deps`,
  contract-typed) and output (the returned verbs). No classes, no module-level state.
  Exception: pure data (zod schemas, the condition record) and pure helpers (transforms,
  predicates) need no factory.
- **A module is an active factory, not pure data** — `createEpic(deps)` owns its tier's
  rules (condition) AND its tier's verbs, built on the services it is injected. Its public
  surface is the verb API; the raw condition is internal.
- **Dependencies arrive by contract, never by concrete import** — a module's `deps` are
  typed by `lib/contracts/` (`StorePort`, `ConfigPort`, and `Tier` for a module that
  composes another module). The implementation is injected at the one assembly point. The
  inversion holds: no module imports a concrete service or a sibling module.
- **One orchestrator** — `cli/cli.ts` (`createCli`) is the single composition root: it
  instantiates the services, then each tier factory (DI), and routes `argv → tier → verb`.
  The only place a contract meets its implementation.
- **`lib/` is the base** — `lib/contracts/` (the ports), `lib/utils/` (zero-dep
  primitives: error factory, predicates, the evidence predicate, arg/envelope helpers),
  `lib/constants/`. Imported by all, imports nothing internal.
- **One effect** — the whole engine is a pure core around a single IO seam
  (`services/store/io`). `config` executes nothing — its readers are injected; the real
  fs · yaml · lock effects live solely in `bin.ts`.
- **Universal substrate rules stay generic** — the hard invariant (no ac→done without
  evidence) is universal, enforced ONCE inside `store.mutate` (every write), never
  duplicated per module.

## Layers + the dependency rule

```
lib/         primitives — contracts (ports) · utils · constants. Imported by all, imports nothing.
modules/     tier FACTORIES (createPhase·createTask·createEpic·createProject) — own their rules + verbs,
             DI'd the services they demand (by contract). May compose another module (by contract).
services/    generic mechanisms (store · config) — know no tier. store exposes for(condition) → { read, mutate }.
cli/         createCli(deps): instantiate services, instantiate the tier factories (DI), route argv → tier → verb.
```

- **A module never imports a concrete service or a sibling module.** It demands them by
  contract (`StorePort`, `ConfigPort`, `Tier`) and receives the implementation injected at
  `createCli`. That is the whole inversion: the tiers compose without coupling.
- **The store primitive is the seam.** `services/store` is a generic guarded
  read-modify-write — `for(condition) → { read, mutate }`. A tier factory binds it to its
  own condition and writes its verbs as `ops.mutate(slug, pureTransform)`. The generic part
  (schema-validate · transitions · atomic-write+CAS · evidence invariant) is shared; the
  transforms are the tier's.
- A capability used by **only one** consumer is **not** a service — it colocates inside
  that consumer (codec lives inside store).

## Tree (target)

```
core/src/
├── bin.ts                          # the only effectful site (fs · yaml · lock · process) — builds deps, calls createCli
├── index.ts                        # the package entry: re-exports the public surface (the one permitted index.ts)
│
├── lib/                            # the base · imported by all · imports nothing internal
│   ├── contracts/                  # the ports (interface-only) — each carries a conformance spec
│   │   ├── io.ts                   # Io          { atomicWrite, readFile, move, remove, statVersion }
│   │   ├── store.ts                # StorePort   { for(condition) → { read, mutate } } + NodeGateway
│   │   ├── config.ts               # ConfigPort  { planFor, fields, raw } + PlanStep/StepPlan
│   │   ├── tier.ts                 # Tier (a module factory's OUTPUT: the verb surface) + Condition
│   │   └── cli.ts                  # Cli         { run(argv) → exitCode } + Anchored
│   ├── utils/                      # zero-dep primitives · no special knowledge
│   │   ├── error.ts                # the typed-error factory (anchoredError + AnchoredError)
│   │   ├── evidence/evidence.ts    # isEvidenceFilled — the pure predicate the store's invariant uses
│   │   ├── envelope/envelope.ts    # { ok, command, result|error } JSON serializer (cli-only-transport)
│   │   └── args/args.ts            # argv → typed args (parse/validate) — shared by the tier factories' cli parts
│   └── constants/                  # fixed axes: stages · statuses · transitions
│
├── modules/                        # tier FACTORIES · demand contracts · DI'd at createCli · 100% covered
│   ├── shared/schema.ts            # cross-tier zod FRAGMENTS (slugs · AC · question · log · context) — the modules' base
│   ├── phase/
│   │   ├── phase.ts                # createPhase(deps) → Tier: leaf · owns PhaseSchema + ac/evidence verbs
│   │   ├── schema.ts               # the condition DATA (schema · transitions · childTier) — internal to the module
│   │   └── phase.spec.ts
│   ├── task/task.ts                # createTask({ store, config }) → Tier · phase-collection + lifecycle verbs
│   ├── epic/epic.ts                # createEpic({ store, config, task }) → Tier · task-STUB verbs + roll-up (reads task files)
│   └── project/project.ts          # createProject({ store, config, epic }) → Tier · epic-STUB verbs
│
├── services/                       # generic mechanisms · know NO tier · import only lib
│   ├── store/                      # the node mechanism: guarded read-modify-write a node
│   │   ├── store.ts                # createStore({ io, codec }) → StorePort: for(condition) → { read, mutate }
│   │   ├── io/io.ts                # ⚡ the ONLY effect: atomic write (mkdir → lock → temp → rename → CAS)
│   │   ├── codec/{parse,render}    # store-internal (yaml ⇆ node) — has the yaml dep + $schema header, NOT a util
│   │   ├── invariants/             # the UNIVERSAL guard (ac→done needs evidence) — applied inside mutate
│   │   └── transitions/            # the generic assertTransition — reads condition.transitions
│   └── config/                     # createConfig({ readDefault, readUser, merge }) → ConfigPort
│       ├── config.ts · merge.ts · plan-for.ts · config-schema/ · …
│
└── cli/                            # assembly + routing ONLY
    ├── cli.ts                      # createCli(deps): instantiate services → instantiate tier factories (DI) →
    │                               #   route argv → modules[tier].run(verb, rest) → envelope. THE composition root.
    ├── cli.spec.ts                 # unit-tests the assembly + dispatch (faked deps)
    └── cli.e2e.ts                  # drives the WHOLE thing against real fixtures (epic.yml/task.yml) — writes real files
```

_(shipped: `modules/<tier>/<tier>.ts` are pure `export const epic = {…}` bundles; the
verbs live in `services/store/node-store` + `cli/node-router` + `cli/commands/`. The
target folds the verbs into the factories and deletes `node-router`/`tier-of`/`commands`.)_

## Tier-factory pattern (a module owns its rules AND its verbs)

```ts
// modules/epic/epic.ts — a factory, DI'd the services it demands by contract
import type { StorePort }  from '../../lib/contracts/store.js'    // never io/io.ts, never node-store.ts
import type { ConfigPort } from '../../lib/contracts/config.js'
import { EpicSchema, epicTransitions } from './schema.js'         // the condition DATA — internal

export function createEpic(deps: { store: StorePort; config: ConfigPort }) {
  const condition = { tier: 'epic', schema: EpicSchema, transitions: epicTransitions, childTier: 'task', … }
  const ops = deps.store.for(condition)             // bind the generic RMW primitive to epic's rules
  return {
    plan:     (input) => ({ node: …, steps: deps.config.planFor('epic', 'plan') }),  // lifecycle (config)
    get:      (slug)    => ops.read(slug),                                            // node — delegate CRUD
    status:   (slug, s) => ops.mutate(slug, (n) => ({ ...n, status: s })),            // (invariant inside mutate)
    childAdd: (slug, c) => ops.mutate(slug, addStub(c)),                              // collection / tier-specific
    rollUp:   (slug)    => …,                                                         // epic-only, encapsulated here
  }
}
```

`phase` / `task` / `project` are the same shape — they differ in their condition (schema ·
transitions · child) and their tier-specific verbs. `epic` additionally demands `task`
(by the `Tier` contract) because its roll-up reads child task files. **No tier factory
imports a service or a sibling concretely** — everything arrives injected. Common CRUD delegates to
the bound `ops`; tier-specifics (roll-up, evidence-flip) live in the factory. Same RMW
mechanism, different verbs. That is the fractal.

## Contracts (the only thing crossing a boundary)

Every capability ships an interface in `lib/contracts/`; an implementation — and every
module factory — imports only the *interface* it needs, never a concrete neighbour:

```ts
// services/store/store.ts — the generic mechanism implements a port
import type { Io }        from '../../lib/contracts/io.js'        // the effect seam
import type { StorePort } from '../../lib/contracts/store.js'
export function createStore(deps: { io: Io; codec: Codec }): StorePort { /* for(condition) → {read,mutate} */ }

// modules/epic/epic.ts — a factory demands ports + (optionally) another module's Tier contract
import type { StorePort } from '../../lib/contracts/store.js'
import type { Tier }      from '../../lib/contracts/tier.js'      // the module-output contract
export function createEpic(deps: { store: StorePort; config: ConfigPort }): Tier { … }
```

`lib/` imports nothing internal and is imported by everyone. A service is fully fakeable by
a stub `Io`; a module is fakeable by a stub `StorePort`. Concrete implementations meet
their contracts in exactly one place: `cli/cli.ts`.

## Assembly (the one place factories meet their services)

```ts
// cli/cli.ts — createCli: instantiate services, then each tier factory (DI), return the model + route.
import { createStore }  from '../services/store/store.js'
import { createConfig } from '../services/config/config.js'
import { createPhase }  from '../modules/phase/phase.js'
import { createTask }   from '../modules/task/task.js'
import { createEpic }   from '../modules/epic/epic.js'
import { createProject }from '../modules/project/project.js'
import { envelope }     from '../lib/utils/envelope/envelope.js'

export function createCli(deps): Anchored {
  const store  = createStore({ io: createIo(deps.io), codec: createCodec(deps) })  // StorePort
  const config = createConfig(deps).load(deps.projectRoot)                          // ConfigPort

  const phase   = createPhase({ store, config })
  const task    = createTask({ store, config })
  const epic    = createEpic({ store, config, task })    // roll-up reads child task files — task injected by contract
  const project = createProject({ store, config, epic })
  const tiers   = { phase, task, epic, project }
  const validate = createValidate({ config, tiers })
  const help     = createHelp({ tiers })

  return {
    config,
    run: async (argv) => {                               // grammar (api.md): anchored <tier> <verb> [slug] …
      const [tier, verb, ...rest] = argv
      if (isMeta(tier)) return print(metaFor(tier, { tiers, validate, help }))
      try { return emit(envelope(`${tier} ${verb}`, await tiers[tier].run(verb, rest))) }
      catch (e) { return emit(envelope(`${tier} ${verb}`, undefined, e)) }
    },
  }
}
//  bin.ts injects the real effects (fs · yaml · lock · process) and calls createCli; index.ts re-exports it.
```

Runtime flow: `argv → cli → modules[tier].run(verb, rest)` — a **direct lookup** (the tier
is the first token of the grammar; no file-shape derivation for routing). **core never
spawns.** A lifecycle verb returns the step-plan; the plugin **skill** is the orchestrator
that spawns workers and drives the loop. `build.each` recursion is the skill calling
`anchored task build <child>` as a subprocess — never a module→module call.

## Responsibilities

| unit | layer | responsibility | factory: in → out |
|---|---|---|---|
| `bin.ts` | entry | the only real effects (process · fs · yaml · lock); injects them, calls createCli | — |
| `lib/contracts/*` | lib | interface-only ports; imported by all, imports nothing | pure types |
| `lib/utils/*` · `lib/constants/*` | lib | zero-dep primitives (error · evidence · envelope · args) + fixed axes | pure |
| `cli/cli.ts` | orchestrator | THE root: build services, instantiate tier factories (DI), route `<tier> <verb>` | `createCli(deps) → { run, config }` |
| `modules/<tier>/<tier>.ts` | module | a **factory**: owns the condition + the tier's verbs (lifecycle · node · collection), built on injected services | `createEpic(deps) → Tier` |
| `services/store` | service | the generic guarded read-modify-write + the only effect (atomic write, lock+CAS) + codec + the universal invariant | `createStore({ io, codec }) → { for(condition) → { read, mutate } }` |
| `services/config` | service | load + merge (default ⊕ user, once) AND derive `planFor(tier,stage)` → step-plan | `createConfig({ readDefault, readUser, merge }) → ConfigPort` |

### What dissolved (and where it went)

| was | why it changes | new home |
|---|---|---|
| `modules/<tier>` = pure condition bundle | a module is now a factory that owns its verbs | `modules/<tier>/<tier>.ts` = `createX(deps) → Tier` (condition kept internal) |
| `services/store/node-store` (generic god-kernel) | per-verb transforms belong to the tier; only the RMW is generic | `services/store/store.ts` keeps `for(condition) → {read,mutate}`; transforms move INTO the factories |
| `cli/node-router` (slug facade) | routing is a direct tier lookup (tier-first grammar) | gone — `createCli` dispatch |
| `cli/tier-of` | not needed for routing (tier is explicit in the grammar) | gone (or a guard inside `services/store`) |
| `cli/commands/{stage,node,lifecycle}/*` | the verb logic belongs to the tier | folds INTO each `createX` |
| `cli/anchored.ts` (createAnchored) | the assembly IS createCli | merged into `cli/cli.ts` |
| `domain/` (the whole layer) | dissolved already in v1 reshape | gone |

## Dependencies (decided in v1, carried forward)

- `proper-lockfile` — cross-process write lock. Keep.
- Zod **v4** has native `z.toJSONSchema()` → drop the old `zod-to-json-schema` for the
  `# yaml-language-server: $schema=…` header.
- `write-file-atomic` evaluated + rejected: no CAS, which is the real guard against the
  parallel epic fan-out. Hand-built atomic write stays.
