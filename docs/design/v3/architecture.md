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
  (`services/store/io`). `config` executes nothing — its readers are injected; the
  real fs · yaml · lock effects live solely in `bin.ts`.
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
├── bin.ts                          # the only effectful site (fs · yaml · lock · process) — builds deps, calls createAnchored
├── index.ts                        # the package entry: re-exports the public surface from cli/ (the one permitted index.ts)
│
├── lib/                            # the base · imported by all · imports nothing internal
│   ├── contracts/                  # the ports (interface-only) — each carries a conformance spec
│   │   ├── io.ts                   # Io           { atomicWrite, readFile, move, remove, statVersion }
│   │   ├── store.ts                # StorePort    { for(descriptor) → { read, mutate } } + NodeGateway
│   │   ├── config.ts               # ConfigPort   { planFor, fields, raw } + PlanStep/StepPlan
│   │   ├── tier.ts                 # TierCondition (the bundle) + TierOps + TierDescriptor alias
│   │   └── cli.ts                  # Cli          { run(argv) → exitCode } + Anchored
│   ├── utils/                      # zero-dep primitives · no special knowledge
│   │   ├── error.ts                # the typed-error factory (anchoredError + AnchoredError)
│   │   └── evidence/evidence.ts    # isEvidenceFilled — the pure predicate BOTH module schema + store guard use
│   └── constants/                  # fixed axes — what lets a module + the store agree on an enum without importing each other
│       ├── stages.ts               # the lifecycle stage axis (plan · refine · build · wrap)
│       ├── statuses.ts             # lifecycle · phase · stub · executor status axes
│       └── transitions.ts          # lifecycleTransitions (epic·task·project) + phaseTransitions (the edge maps)
│
├── modules/                        # PURE tier conditions · import only lib (+ the shared base) · never imported BY a service · covered
│   ├── shared/schema.ts            # cross-tier zod FRAGMENTS (slugs · AC · question · log · context) — the modules' own base
│   ├── phase/phase.ts              # condition bundle · leaf (no childTier) · owns PhaseNodeSchema + ac/evidence shape
│   ├── task/task.ts                # condition bundle · childTier:'phase' (embeds PhaseNodeSchema — strict downward containment)
│   ├── epic/epic.ts                # condition bundle · childTier:'task' (task STUBS)
│   └── project/project.ts          # condition bundle · childTier:'epic' (epic STUBS) — BUILT OUT, uniform lifecycle
│
├── services/                       # generic mechanisms · know NO tier · fed conditions via DI · import only lib
│   ├── store/                      # the node mechanism: read-modify-write a node, guarded
│   │   ├── node-store/node-store.ts # createNodeOps(condition, deps) → the tier-generic verbs (create,setStatus,addChild,addAc,…)
│   │   ├── io/io.ts                # ⚡ the ONLY effect: atomic write (mkdir → lock → temp → rename → CAS)
│   │   ├── codec/{parse,render}    # store-internal (yaml ⇆ node) — has the yaml dep + $schema header, NOT a util
│   │   ├── invariants/invariants.ts # the UNIVERSAL guard (ac→done needs evidence) — once, here, not per tier
│   │   ├── transitions/transitions.ts # the generic assertTransition — reads descriptor.transitions, knows no tier
│   │   ├── children/ · questions/ · log.ts · validate/   # generic helpers (loop-queue · q&a · audit log · validate cmd)
│   └── config/                     # capability: yaml ⇆ effectiveConfig + step-plan — fully pure (readers injected)
│       ├── bootstrap.ts            # createBootstrap({ readDefault, readUser, merge }) → { load }
│       ├── merge.ts                # pure: default ⊕ user, once
│       ├── config-schema/          # ConfigSchema + custom-fields (extend a tier schema with declared fields)
│       ├── plan-for.ts             # pure: merged config → ordered step-plan (expands build:{each}); folds resolve-steps
│       ├── resolve-steps/ · step.ts · worker-dispatch/ · init.ts
│
└── cli/                            # ← THE orchestrator — builds services, injects conditions, dispatches <tier>
    ├── anchored.ts                 # createAnchored(deps) → { cli, ops, config }: THE composition root (collects bundles, injects)
    ├── cli.ts                      # createCli(deps) → { run(argv) → exitCode }: argv dispatch, one JSON envelope per call
    ├── node-router/node-router.ts  # createSlugFacade — slug → tier (tier-of) → node verb (the dissolved store router)
    ├── tier-of/tier-of.ts          # tierOfNode / makeTierFor — derive a node's tier from its child collection / file shape
    └── commands/                   # argv → verb routing (stage· · node· · lifecycle·)
```

> The step-name → worker mapping currently lives in `services/config/worker-dispatch/`
> as code (relocated from v2). Moving it into the default template
> (`anchored.default.yml`) so `plan-for` reads it as pure config policy is an
> intentionally-deferred, behaviour-preserving follow-up (it touches the config
> merge). `resolve-steps` is already folded into `plan-for`.

## Tier-module pattern (a module is pure conditions — no wiring, no I/O)

```ts
// modules/epic/epic.ts — the whole module: a pure condition bundle (no I/O, no verbs)
import { lifecycleStatusValues, stubStatusValues } from '../../lib/constants/statuses.ts'
import { lifecycleTransitions } from '../../lib/constants/transitions.ts'
import type { TierCondition } from '../../lib/contracts/tier.ts'
import { KebabSlug, AcceptanceCriterion, … } from '../shared/schema.ts'   // the shared base
// EpicNodeSchema is assembled HERE from the shared fragments
export const epic: TierCondition = {
  tier: 'epic',
  schema: EpicNodeSchema,
  statusValues: lifecycleStatusValues,    // its own status axis
  transitions: lifecycleTransitions,      // which status→status edges are legal (shared by epic·task·project)
  defaultStatus: 'plan',
  childTier: 'task',                      // the child relationship …
  childField: 'tasks',                    // … where children live …
  childStatusValues: stubStatusValues,    // … the child's status axis (task-STUBS use the loop-queue marker)
  childTerminalOk: ['done'],              // … and which child states let the parent complete
}
```

`task` / `phase` / `project` are the same shape — they differ only in schema, status
axis, transitions, and the child relationship (`phase` is the leaf: no `childTier`,
no child fields). **No tier module imports a service, touches I/O, or holds the
verbs** — that is the generic node-service's job. Completability is NOT a per-tier
function: it is the universal invariant (every AC evidence-backed, every child
terminal-OK) enforced once in the generic store from `childTerminalOk`. The verb
*surface* a tier exposes (epic→`child`, phase→`ac`) follows from `childTier` + the
schema. Same mechanics, different conditions. That is the fractal.

## Contracts (the only thing crossing a boundary)

Every capability ships an interface in `lib/contracts/`; an implementation imports the
interface it needs, never a neighbour's concrete file. A module imports only `lib/`:

```ts
// services/store/node-store/node-store.ts — a service imports the port, never a module
import type { Io } from '../../../lib/contracts/io.ts'   // the seam — never a concrete neighbour
import type { TierCondition } from '../../../lib/contracts/tier.ts'
export function createNodeOps(condition: TierCondition, deps: { io: Io; … }) { … }

// modules/epic/epic.ts — a module imports ONLY lib (+ the shared schema base), never a service
import { lifecycleTransitions } from '../../lib/constants/transitions.ts'
import type { TierCondition } from '../../lib/contracts/tier.ts'
export const epic: TierCondition = { /* schema · statusValues · transitions · childTier · child axes */ }
```

`lib/` imports nothing internal and is imported by everyone. A service is fully fakeable
by a stub Io; a module is pure, so it needs no fakes at all. Concrete implementations
meet their contracts in exactly one place: the orchestrator (`cli/anchored.ts`).

## Assembly (the one place conditions meet the mechanism)

```ts
// cli/anchored.ts — THE orchestrator (a contract meets its implementation here, once)
import { phase } from '../modules/phase/phase.ts'
import { task } from '../modules/task/task.ts'
import { epic } from '../modules/epic/epic.ts'
import { project } from '../modules/project/project.ts'
export function createAnchored(deps): Anchored {
  const CONDITIONS = { phase, task, epic, project }                  // the modules' pure tier knowledge
  const config = createBootstrap(deps).load(deps.projectRoot)        // merge default ⊕ user, once
  // one generic node-ops per tier, each FED its condition bundle (+ the extended schema)
  const opsByTier = mapValues(CONDITIONS, (c) => createNodeOps(c, { io: createIo(deps.io), … }))
  const facade = createSlugFacade({ opsFor, tierFor: makeTierFor(io, …), … })  // slug → tier → verb
  const cli    = createCli({ nodeOps: facade, steps: config.planFor, … })      // argv dispatch
  return { cli, ops: facade, config }
}
//  bin.ts injects the real effects (fs · yaml · lock · process) and calls createAnchored;
//  index.ts re-exports it. `project` is wired like the rest — no longer reserved.
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
| `cli/anchored.ts` | orchestrator | THE root: build services, collect module conditions, inject, wire facade + dispatch | `createAnchored(deps) → { cli, ops, config }` |
| `cli/cli.ts` | orchestrator | argv → verb dispatch; one JSON envelope per call (cli-only transport) | `createCli(deps) → { run(argv) → exitCode }` |
| `cli/node-router` · `cli/tier-of` | orchestrator | slug → tier (file-shape derivation) → node verb (the dissolved store router) | `createSlugFacade(deps) → facade` |
| `modules/<tier>/<tier>.ts` | module | the **pure condition bundle**: schema · statusValues · transitions · defaultStatus · child relationship. No wiring, no I/O. | pure data (`export const epic`) |
| `services/store/node-store/node-store.ts` | service | the tier-generic verbs (create/setStatus/addChild/addAc…), fed ONE condition bundle | `createNodeOps(condition, deps) → { verbs }` |
| `services/store/{io,codec,invariants,transitions}` | service | the only effect (atomic write, lock+CAS) + codec (yaml⇆node) + the universal evidence invariant + generic assertTransition | factories / pure guards |
| `services/config` | service | load + merge (default ⊕ user, once) AND derive `planFor(tier,stage)` → step-plan | `createBootstrap({ readDefault, readUser, merge }) → { load }` |

### What dissolved (and where it went)

| was a "service" | why not | new home |
|---|---|---|
| `codec` | pure; only consumer is store | inside `services/store` |
| `invariants` | pure guard; only consumer is store | inside `services/store` |
| `node` (transformers) | ONE generic verb kernel — fed ONE condition bundle, not split per tier | `services/store/node-store/node-store.ts` (generic) |
| `transitions` | the edge *maps* are shared fixed data (epic·task·project identical); the *guard* is generic | maps → `lib/constants/transitions.ts`; `assertTransition` → `services/store/transitions/` |
| `domain/tiers/*` (descriptors) | tier knowledge is pure → becomes the condition bundle | `modules/<tier>/<tier>.ts` |
| `domain/` (the whole layer) | dissolved — the v3 tree is lib → modules → services → cli | gone |
| `node-router` (slug facade) + `tier-of` | slug→tier routing is a dispatch concern, not a store concern | `cli/node-router` + `cli/tier-of` |
| `engine` | never a motor — it only PLANS; the skill orchestrates | split: planner → `config.planFor`, state-machine → store |
| `worker-dispatch` | step-name → worker is policy, not code — SHOULD move to the template | relocated as code to `services/config/worker-dispatch/` (template dissolution DEFERRED) |
| `resolve-steps` | pure, single consumer is the planner | folded into `services/config/plan-for.ts` |
| `isEvidenceFilled` | both the module schema + the store guard need the predicate | `lib/utils/evidence/evidence.ts` (the store keeps the throwing asserts) |

## Dependencies (decided in v1, carried forward)

- `proper-lockfile` — cross-process write lock. Keep.
- Zod **v4** has native `z.toJSONSchema()` → drop the old `zod-to-json-schema` for
  the `# yaml-language-server: $schema=…` header.
- `write-file-atomic` evaluated + rejected: no CAS, which is the real guard against
  the parallel epic fan-out. Hand-built atomic write stays.
