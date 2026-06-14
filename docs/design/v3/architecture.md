# anchored v3 — code architecture

Companion to `api.md` (the CLI surface). This is the **code layout** that mirrors
that surface 1:1.

## Principles

- **Everything is a factory function** — `createX(deps) → { … }`, with a clear
  input (`deps`) and output (the returned verbs). No classes, no module-level state.
  Exception: pure data (zod schemas) and pure guards (invariants, transitions) need
  no factory.
- **Fractal + colocation** — sub-modules nest inside a folder scope. A file stays
  flat while alone; it gets its own folder the moment a companion appears (helper,
  spec). The folder's main file is named after the folder (`epic.ts`, `ops.ts`).
- **Modules are pure tier knowledge** — a `modules/<tier>` is NOT an orchestrator; it
  is the pure bundle of that tier's conditions (schema · transitions · child
  relationship · when it is complete). It imports only `lib/`, performs no I/O, and
  nobody imports its internals.
- **Services are generic + DI-fed** — the node/store service is one tier-generic
  mechanism that knows no concrete tier; it receives the modules' conditions injected.
  **Modules and services never import each other.**
- **One orchestrator** — the `cli/` is the single composition root (a factory fn,
  `createAnchored`): it builds the services, collects each module's conditions, injects
  them, and dispatches `<tier>`. The only place a contract meets its implementation.
- **`lib/` is the base** — `lib/contracts/` (the ports), `lib/utils/` (zero-dep
  primitives: error factory, pure predicates), `lib/constants/`. Imported by all,
  imports nothing internal.
- **One effect** — the whole engine is a pure core around a single IO seam
  (`store/io`). `config` executes nothing — its readers are injected; the real
  fs · yaml · lock effects live solely in `bin.ts`.
- **Universal substrate rules stay generic** — the hard invariant (no ac→done without
  evidence) is universal, lives ONCE in the service, never duplicated per module.

## Layers + the dependency rule

Four layers; the inversion is the point — modules and services don't depend on each
other, they meet at the orchestrator:

```
lib/         primitives — contracts (ports) · utils · constants. Imported by all, imports nothing.
modules/     tier units (epic·task·phase·project) — PURE tier conditions. Import only lib.
services/    generic mechanism (store · config) — knows no tier, fed conditions via DI. Import only lib.
cli/         the orchestrator (factory fn) — builds services, injects module conditions, dispatches <tier>.
```

- **modules ↔ services never import each other.** A module is pure knowledge (what a
  tier is, when it's satisfied); a service is a generic mechanism *told* the rules.
  They meet only at the orchestrator, by DI. A module is trivially testable (pure
  functions); a service is tier-agnostic.
- **The condition bundle is the seam.** Each module exports its tier conditions
  (schema · transitions · child · completability); the generic node-service takes them
  via a factory — `createNodeOps({ epic, task, phase, project }, deps)` — or a single
  injected `const nodeConditions`. The service checks conditions it is given; it never
  knows which tier it is serving.
- A capability used by **only one** consumer is **not** a service — it colocates
  inside that consumer (codec lives inside store).

## Tree

```
core/src/
├── bin.ts                          # the only effectful site (fs · yaml · lock · process) — builds deps, calls cli
│
├── lib/                            # the base · imported by all · imports nothing internal
│   ├── contracts/                  # the ports (interface-only)
│   │   ├── io.ts                   # Io         { atomicWrite, readFile, move, remove, statVersion }
│   │   ├── store.ts                # StorePort  { for(conditions) → { read, mutate } }
│   │   ├── config.ts               # ConfigPort { planFor, fields, raw } + PlanStep/StepPlan
│   │   ├── tier.ts                 # Tier conditions + TierOps — the tier surface
│   │   └── cli.ts                  # Cli        { run(argv) → exitCode } + Anchored
│   ├── utils/                      # zero-dep primitives · no special knowledge
│   │   └── error.ts                # the typed-error factory (anchoredError + AnchoredError)
│   └── constants/
│       └── stages.ts               # the lifecycle stage axis (plan · refine · build · wrap)
│
├── cli/                            # ← THE orchestrator (factory fn) — builds services, injects conditions, dispatches
│   ├── cli.ts                      # createAnchored(deps) → { run, config }: build services, inject into tiers, dispatch <tier>
│   ├── commands/                   # argv → verb routing (stage· · node· · lifecycle·)
│   └── cli.spec.ts
│
├── modules/                        # PURE tier conditions · import only lib · never imported BY a service · 100% covered
│   ├── epic/
│   │   ├── epic.ts                 # the condition bundle: { schema, statusValues, transitions, childTier:'task', completable }
│   │   ├── transitions.ts          # epic's legal status edges (forward-only + update-mode) — pure
│   │   └── epic.spec.ts            # a pure module is cheap to cover fully
│   ├── task/   …                   # condition bundle · childTier:'phase'
│   ├── phase/  …                   # condition bundle · leaf (no childTier) · ac + evidence shape
│   └── project/                    # BUILT OUT (no longer reserved) · childTier:'epic'  ← needs full impl + specs
│
└── services/                       # generic mechanisms · know NO tier · fed conditions via DI · import only lib
    ├── store/                      # the node mechanism: read-modify-write a node, guarded
    │   ├── node.ts                 # createNodeOps(conditions, deps) → the tier-generic verbs (create,setStatus,addChild,addAc,…)
    │   ├── store.ts                # createStore({ io, yaml }) → { for(conditions) → { read, mutate } }
    │   ├── io/io.ts                # ⚡ the ONLY effect: atomic write (mkdir → lock → temp → rename → CAS)
    │   ├── codec/                  # store-internal (yaml ⇆ node) — has the yaml dep + $schema header, NOT a util
    │   │   ├── parse/parse.ts
    │   │   └── render/render.ts
    │   ├── invariants.ts           # the UNIVERSAL guard (ac→done needs evidence) — once, here, not per tier
    │   └── store.spec.ts
    └── config/                     # capability: yaml ⇆ effectiveConfig + step-plan — fully pure (readers injected)
        ├── config.ts               # createConfig({ readDefault, readUser, merge }) → { load, planFor }
        ├── merge.ts                # pure: default ⊕ user, once
        ├── schema.ts               # ConfigSchema
        ├── plan-for.ts             # pure: merged config → ordered step-plan (expands build:{each})
        └── config.spec.ts
```

> The step-name → worker mapping is **not** a code file — it lives in the default
> template (`anchored.default.yml`), so `plan-for.ts` stays a pure config query and
> the worker set is overridable like any other policy. (v2's `worker-dispatch.ts`
> dissolved into the template; `resolve-steps` folded into `plan-for`.)

## Tier-module pattern (a module is pure conditions — no wiring, no I/O)

```ts
// modules/epic/epic.ts — the whole module: a pure condition bundle
import { EpicNodeSchema, epicStatusValues } from './schema.ts'
import { assertEpicTransition } from './transitions.ts'
export const epic = {
  tier: 'epic',
  schema: EpicNodeSchema,
  statusValues: epicStatusValues,
  transitions: assertEpicTransition,   // which status→status edges are legal — per tier
  childTier: 'task',                   // its child relationship
  completable: (node) => …,            // when THIS tier is satisfied
}
```

`task` / `phase` / `project` are the same shape — they differ only in schema,
transitions, and child relationship. **No tier module imports a service, touches I/O,
or holds the verbs** — that is the generic node-service's job. The verb *surface* a
tier exposes (epic→`child`, phase→`ac`) is derived by the orchestrator from `childTier`
+ the schema. Same mechanics, different conditions. That is the fractal.

## Contracts (the only thing crossing a boundary)

Every capability ships an interface in `lib/contracts/`; an implementation imports the
interface it needs, never a neighbour's concrete file. A module imports only `lib/`:

```ts
// services/store/store.ts — a service imports the port, never the concrete neighbour
import type { Io } from '../../lib/contracts/io.ts'      // the seam — never io/io.ts
import type { StorePort } from '../../lib/contracts/store.ts'
export function createStore(deps: { io: Io; … }): StorePort { … }

// modules/epic/epic.ts — a module imports ONLY lib (utils + contracts), never a service
import { anchoredError } from '../../lib/utils/error.ts'
import type { TierConditions } from '../../lib/contracts/tier.ts'
export const epic: TierConditions = { /* schema · transitions · childTier · completable */ }
```

`lib/` imports nothing internal and is imported by everyone. A service is fully fakeable
by a stub Io; a module is pure, so it needs no fakes at all. Concrete implementations
meet their contracts in exactly one place: the orchestrator (`cli/cli.ts`).

## Assembly (the one place conditions meet the mechanism)

```ts
// cli/cli.ts — THE orchestrator (a contract meets its implementation here, once)
import { epic } from '../modules/epic/epic.ts'
import { task } from '../modules/task/task.ts'
import { phase } from '../modules/phase/phase.ts'
import { project } from '../modules/project/project.ts'
export function createAnchored(deps): Anchored {
  const conditions = { epic, task, phase, project }                 // the modules' pure tier knowledge
  const config = createConfig(deps.config).load(deps.projectRoot)
  const node   = createNodeOps(conditions, { io: createIo(deps.io), yaml: deps.yaml })
  return { run: dispatch({ conditions, node, config }), config }    // run(argv) → tierOf(slug) → node verbs
}
//  bin.ts injects the real effects (fs · yaml · lock · process) and calls createAnchored.
//  `project` is wired like the rest — no longer reserved.
```

Runtime flow: `argv → cli → tierOf(slug) → node verb (asserts that tier's conditions)
| config.planFor (a menu)`.
**core never spawns.** A stage verb returns the step-plan; the plugin **skill** is
the orchestrator that spawns workers and drives the loop. `build.each` recursion is
the skill calling `anchored task build <child>` as a subprocess — never a
module→module import.

## Responsibilities

| unit | layer | responsibility | factory: in → out |
|---|---|---|---|
| `bin.ts` | entry | the only real effects (process · fs · yaml · lock); injects them, calls createAnchored | — |
| `lib/contracts/*` | lib | interface-only ports; imported by all, imports nothing | pure types |
| `lib/utils/*` · `lib/constants/*` | lib | zero-dep primitives (error factory, predicates) + fixed values (stages) | pure |
| `cli/cli.ts` | orchestrator | THE root: build services, collect module conditions, inject, dispatch `tierOf(slug)` | `createAnchored(deps) → { run, config }` |
| `modules/<tier>/<tier>.ts` | module | the **pure condition bundle**: schema · statusValues · transitions · childTier · completable. No wiring, no I/O. | pure data (`export const epic`) |
| `modules/<tier>/transitions.ts` | module | that tier's legal status edges (per-tier state machine) | pure |
| `services/store/node.ts` | service | the tier-generic verbs (create/setStatus/addChild/addAc…), fed the conditions | `createNodeOps(conditions, deps) → { verbs }` |
| `services/store` | service | the gateway + the only effect: atomic write (lock+CAS), read, move; codec (yaml⇆node) + the universal invariant | `createStore({ io, yaml }) → { for(conditions) → { read, mutate } }` |
| `services/config` | service | load + merge (default ⊕ user, once) AND derive `planFor(tier,stage)` → step-plan | `createConfig({ readDefault, readUser, merge }) → { load, planFor }` |

### What dissolved (and where it went)

| was a "service" | why not | new home |
|---|---|---|
| `codec` | pure; only consumer is store | inside `services/store` |
| `invariants` | pure guard; only consumer is store | inside `services/store` |
| `node` (transformers) | ONE generic verb kernel — fed the conditions, not split per tier | `services/store/node.ts` (generic) |
| `transitions` | edges differ per tier → live WITH the tier's conditions | `modules/<tier>/transitions.ts` |
| `node-router` (slug facade) | slug→tier routing is a dispatch concern | `cli/` (the orchestrator) |
| `engine` | never a motor — it only PLANS; the skill orchestrates | split: planner → `config.planFor`, state-machine → tier |
| `worker-dispatch` | step-name → worker is policy, not code | the default template (`anchored.default.yml`) |
| `resolve-steps` | pure, single consumer is the planner | folded into `config/plan-for.ts` |

## Dependencies (decided in v1, carried forward)

- `proper-lockfile` — cross-process write lock. Keep.
- Zod **v4** has native `z.toJSONSchema()` → drop the old `zod-to-json-schema` for
  the `# yaml-language-server: $schema=…` header.
- `write-file-atomic` evaluated + rejected: no CAS, which is the real guard against
  the parallel epic fan-out. Hand-built atomic write stays.
