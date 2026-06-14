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
  typed by `lib/contracts/` (`StorePort`, `TemplatePort`, and `Tier` for a module that
  composes another module). The implementation is injected at the one assembly point. The
  inversion holds: no module imports a concrete service or a sibling module.
- **One orchestrator** — `cli/cli.ts` (`createCli`) is the single composition root: it
  instantiates the services, then each tier factory (DI), and routes `argv → tier → verb`.
  The only place a contract meets its implementation.
- **`lib/` is the base — and it is tiny.** Something earns a place in `lib` only if it
  **crosses a layer boundary** (a contract) OR is needed by **literally every layer**
  (`error`). Single-consumer things colocate with that consumer — "pure" alone does not
  earn a lib slot. So `lib/` = `contracts/` (the five ports) + `utils/error.ts`. No
  `constants/`; tier knowledge (statuses · transitions · the evidence predicate) lives in
  `modules/shared` (only the modules use it, now that the store is dumb), `stages` lives in
  `services/template` (only validate uses it), `envelope`/`args` live in `cli`.
- **One effect** — the whole engine is a pure core around a single effect seam: the
  filesystem (`fs`). `store` is built on injected `fs` + `lock` + `yaml`; `template`
  executes nothing — its readers are injected. The real fs · lock effects live solely in
  `bin.ts`. There is no separate `io`/`codec` layer.
- **The universal rule lives in the SCHEMA, not the service** — the only universal guard
  (no ac→done without evidence) is a Zod `.refine` on the shared `AcceptanceCriterion`
  fragment. Because `store.write` runs `schema.parse` on every write, it is unskippable —
  and the store never learns what evidence is. The schema is the law.

## Layers + the dependency rule

```
lib/         the base — contracts (the five ports) + utils/error. Imported by all, imports nothing.
modules/     tier FACTORIES (createPhase·createTask·createEpic·createProject) — own their rules + verbs,
             DI'd the services they demand (by contract). May compose another module (by contract).
services/    two dumb mechanisms (store · template) — know no tier. store = read/write a node validated by a given schema; template = merge + serve the settings.
cli/         createCli(deps): instantiate services, instantiate the tier factories (DI), route argv → tier → verb.
```

- **A module never imports a concrete service or a sibling module.** It demands them by
  contract (`StorePort`, `TemplatePort`, `Tier`) and receives the implementation injected at
  `createCli`. That is the whole inversion: the tiers compose without coupling.
- **The store is the seam — and it is dumb.** `createStore({ fs, lock, yaml })` exposes
  `read(slug, schema)` / `write(slug, node, schema)` (+ `move`/`remove`): load/persist a
  node *safely* (yaml ⇄ object · atomic temp+rename under `lock` + compare-and-swap) and
  validate against **the schema it is handed**. It knows no tier, no evidence, no
  transition. A tier factory does `store.write(slug, transform(node), mySchema)`; the
  schema (with its evidence `.refine`) is the only law the store enforces.
- A capability used by **only one** consumer is **not** a service — it colocates inside
  that consumer (the atomic-write dance is store-internal).

## Tree (target)

```
core/src/
├── bin.ts                          # the only effectful site (fs · yaml · lock · process) — builds deps, calls createCli
├── index.ts                        # the package entry: re-exports the public surface (the one permitted index.ts)
│
├── lib/                            # the base · ONLY contracts + error · imported by all, imports nothing
│   ├── contracts/                  # the FIVE ports (interface-only) — the only thing that crosses a boundary
│   │   ├── fs.ts                   # FileSystem  { readFile, writeFile, rename, unlink, mkdir, stat }   (bin↔store)
│   │   ├── store.ts                # StorePort   { read(slug,schema), write(slug,node,schema), move, remove }  (modules↔store)
│   │   ├── template.ts             # TemplatePort { steps, fields, validate, raw } + Step type            (modules↔template)
│   │   ├── tier.ts                 # Tier (a module factory's OUTPUT: the verb surface) + Schema           (cli/modules↔modules)
│   │   └── cli.ts                  # Cli { run(argv) → exitCode } + Anchored                               (bin↔cli)
│   └── utils/
│       └── error.ts                # anchoredError — the ONE primitive every layer needs. (No constants/, no other util.)
│
├── modules/                        # tier FACTORIES · demand contracts · DI'd at createCli · 100% covered
│   ├── shared/                     # the modules' own base (pure, imported by the tier factories) — tier knowledge lives HERE
│   │   ├── fragments.schemas.ts    # cross-tier zod FRAGMENTS (slugs · AC-with-evidence-refine · question · log · context)
│   │   ├── statuses.ts             # the status enums (lifecycle · phase · stub · executor) — only modules use them
│   │   ├── transitions.ts          # the edge maps + assertTransition(map, from, to) — the status guard
│   │   ├── evidence.ts             # isEvidenceFilled — the predicate the AC `.refine` uses
│   │   ├── children.ts             # child-list transforms (next · ready · add · move) — DAG/loop-queue logic
│   │   ├── questions.ts            # question/concern transforms (add id · resolve)
│   │   ├── log.ts                  # append-only audit-log transform
│   │   └── extend-schema.ts        # apply template.fields(tier) to a tier schema (the module owns its schema)
│   ├── phase/
│   │   ├── phase.ts                # createPhase(deps) → Tier: leaf · owns the ac/evidence verbs (LOGIC only)
│   │   ├── phase.schemas.ts        # PhaseSchema + z.infer types — the tier's schema
│   │   ├── phase.types.ts          # any hand-written types for phase (if needed)
│   │   └── phase.spec.ts
│   ├── task/task.ts                # createTask({ store, template }) → Tier · phase-collection + lifecycle verbs
│   ├── epic/epic.ts                # createEpic({ store, template, task }) → Tier · task-STUB verbs + roll-up (reads task files)
│   └── project/project.ts          # createProject({ store, template, epic }) → Tier · epic-STUB verbs
│                                   #   (no validate module — it is template.validate(); no help module — it lives in cli)
│
├── services/                       # the two dumb mechanisms · know NO tier · import only lib
│   ├── store/                      # read/write a node, validated by a given schema
│   │   ├── store.ts                # createStore({ fs, lock, yaml }) → { read(slug,schema), write(slug,node,schema), move, remove }
│   │   └── scope/safe-write.ts     # store-internal: the atomic-write dance (mkdir → lock → temp → rename → CAS)
│   └── template/                   # manage the configurable policy: default ⊕ user, merge, serve
│       ├── template.ts             # createTemplate({ readDefault, readUser }) → { steps, fields, validate, raw }
│       ├── merge.ts                # pure: anchored.yml ⊕ default.yml (keyed-steps semantics)
│       ├── config.schemas.ts       # ConfigSchema (Zod) — what a valid anchored.yml is
│       └── stages.ts               # the plan·refine·build·wrap axis — only validate() iterates it
│
└── cli/                            # assembly + routing ONLY
    ├── cli.ts                      # createCli(deps): instantiate services → instantiate tier factories (DI) →
    │                               #   route argv → modules[tier].run(verb, rest). THE composition root.
    ├── envelope.ts                 # { ok, command, result|error } JSON serializer — the transport format (cli-only)
    ├── args.ts                     # argv → typed args (parse/validate) — dispatch concern
    ├── cli.spec.ts                 # unit-tests the assembly + dispatch (faked deps)
    └── cli.e2e.ts                  # drives the WHOLE thing against real fixtures (epic.yml/task.yml) — writes real files
```

_(shipped: `modules/<tier>/<tier>.ts` are pure `export const epic = {…}` bundles; the
verbs live in `services/store/node-store` + `cli/node-router` + `cli/commands/`. The
target folds the verbs into the factories and deletes `node-router`/`tier-of`/`commands`.)_

> File suffixes (`.types.ts` · `.schemas.ts` · `.fixtures.ts` · `.fake.ts` and the test
> trio `.spec`/`.int`/`.e2e`): an impl `.ts` is logic-only; types/schemas live in siblings.
> See `requirements-2.md` → "File & suffix conventions".

## Tier-factory pattern (a module owns its rules AND its verbs)

```ts
// modules/epic/epic.ts — a factory, DI'd the services it demands by contract
import type { StorePort }  from '../../lib/contracts/store.js'    // never the concrete store, never fs
import type { TemplatePort } from '../../lib/contracts/template.js'
import { assertTransition, lifecycleTransitions } from '../shared/transitions.js'  // tier knowledge — modules' base
import { EpicSchema } from './phase.schemas.js'   // the tier's schema — carries the evidence .refine; the store's only law

export function createEpic(deps: { store: StorePort; template: TemplatePort }) {
  const { store, template } = deps
  const read  = (slug)       => store.read(slug, EpicSchema)
  const write = (slug, node) => store.write(slug, node, EpicSchema)   // store runs schema.parse → evidence enforced
  return {
    plan:     (input)    => ({ node: …, steps: template.steps('epic', 'plan') }),   // lifecycle (template data)
    get:      (slug)     => read(slug),                                             // node — trivial read
    status:   async (slug, s) => {                                                  // pure guard, then write
      const n = await read(slug); assertTransition(lifecycleTransitions, n.status, s)
      return write(slug, { ...n, status: s })
    },
    childAdd: async (slug, c) => write(slug, addStub(await read(slug), c)),         // collection / tier-specific
    rollUp:   (slug)     => …,                                                      // epic-only, reads task files via deps.task
  }
}
```

`phase` / `task` / `project` are the same shape — they differ in their schema, transition
map, and tier-specific verbs. `epic` additionally demands `task` (by the `Tier` contract)
because its roll-up reads child task files. **No tier factory imports a service or a
sibling concretely** — everything arrives injected. Common CRUD is a trivial
read/transform/write; tier-specifics (roll-up, evidence-flip) live in the factory. Same
store, different verbs. That is the fractal.

## Contracts (the only thing crossing a boundary)

Every capability ships an interface in `lib/contracts/`; an implementation — and every
module factory — imports only the *interface* it needs, never a concrete neighbour:

```ts
// services/store/store.ts — the generic mechanism, built on the fs effect seam
import type { FileSystem } from '../../lib/contracts/fs.js'       // the one effect seam
import type { StorePort }  from '../../lib/contracts/store.js'
export function createStore(deps: { fs: FileSystem; lock: Lock; yaml: Yaml }): StorePort {
  /* read(slug, schema) = fs.readFile → yaml.parse → schema.parse ; write = schema.parse → yaml.stringify → safe-write */
}

// modules/epic/epic.ts — a factory demands ports + (optionally) another module's Tier contract
import type { StorePort } from '../../lib/contracts/store.js'
import type { Tier }      from '../../lib/contracts/tier.js'      // the module-output contract
export function createEpic(deps: { store: StorePort; template: TemplatePort }): Tier { … }
```

`lib/` imports nothing internal and is imported by everyone. The store is fully fakeable by
a stub `FileSystem`; a module is fakeable by a stub `StorePort`. Concrete implementations
meet their contracts in exactly one place: `cli/cli.ts`.

## Assembly (the one place factories meet their services)

```ts
// cli/cli.ts — createCli: instantiate services, then each tier factory (DI), return the model + route.
import { createStore }  from '../services/store/store.js'
import { createTemplate } from '../services/template/template.js'
import { createPhase }  from '../modules/phase/phase.js'
import { createTask }   from '../modules/task/task.js'
import { createEpic }   from '../modules/epic/epic.js'
import { createProject }from '../modules/project/project.js'
import { envelope }     from './envelope.js'                       // cli-local — the transport format

export function createCli(deps): Anchored {
  const store    = createStore({ fs: deps.fs, lock: deps.lock, yaml: deps.yaml })             // StorePort
  const template = createTemplate({ readDefault: deps.readDefault, readUser: deps.readUser }) // TemplatePort

  const phase   = createPhase({ store, template })
  const task    = createTask({ store, template })
  const epic    = createEpic({ store, template, task })    // roll-up reads child task files — task injected by contract
  const project = createProject({ store, template, epic })
  const tiers   = { phase, task, epic, project }

  return {
    template,
    run: async (argv) => {                               // grammar (api.md): anchored <tier> <verb> [slug] …
      const [tier, verb, ...rest] = argv
      if (verb === undefined && tier === 'validate') return emit(template.validate())  // meta — template-backed
      if (tier === 'help') return print(help(tiers))                                   // meta — render the tiers' surface
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
| `lib/contracts/*` | lib | the five interface-only ports — the only thing that crosses a layer boundary | pure types |
| `lib/utils/error.ts` | lib | `anchoredError` — the ONE primitive every layer needs | pure |
| `cli/cli.ts` | orchestrator | THE root: build the two services, instantiate tier factories (DI), route `<tier> <verb>` + the meta-verbs | `createCli(deps) → { run, template }` |
| `modules/<tier>/<tier>.ts` | module | a **factory**: owns the schema + the tier's verbs (lifecycle · node · collection), built on the injected store | `createEpic(deps) → Tier` |
| `modules/shared/*` | module | the modules' pure base — **all tier knowledge**: schema fragments (incl. the evidence `.refine`) · the status enums · the transition maps + `assertTransition` · the evidence predicate · child/question/log transforms · `extendSchema` | pure |
| `services/store` | service | read/write a node **safely** (yaml ⇄ object · atomic temp+rename, lock+CAS, on `fs`) validated by a **given schema** — knows no tier | `createStore({ fs, lock, yaml }) → { read(slug,schema), write(slug,node,schema), move, remove }` |
| `services/template` | service | manage the configurable policy: merge default-template ⊕ user `anchored.yml` (once), validate, and **serve** the steps + custom fields (the step order + worker are DATA — no plan algorithm) | `createTemplate({ readDefault, readUser }) → { steps, fields, validate, raw }` |

### What dissolved (and where it went)

| was | why it changes | new home |
|---|---|---|
| `modules/<tier>` = pure condition bundle | a module is now a factory that owns its verbs | `modules/<tier>/<tier>.ts` = `createX(deps) → Tier` (schema kept internal) |
| `services/store/node-store` (generic god-kernel) | per-verb transforms belong to the tier | `services/store/store.ts` shrinks to `read(slug,schema)`/`write(slug,node,schema)`; transforms → the factories |
| `services/store/io` | the effect is just the filesystem | dissolved — `fs` + `lock` are injected seams into `createStore`; the atomic-write dance is store-internal (`scope/safe-write.ts`) |
| `services/store/codec` (parse/render) | yaml⇄object is the `yaml` lib; the schema comes from the module | dissolved — `store` calls `yaml.parse`/`stringify` + the injected schema |
| `services/store/invariants` | the service must not know what evidence is | dissolved — a Zod `.refine` on the shared `AcceptanceCriterion` (the schema is the law) |
| `services/store/transitions` | a pure per-tier-data guard, not a service | `modules/shared/transitions.ts` (maps + `assertTransition`); the module calls it |
| `services/store/{children,questions,log}` | pure transform helpers, no effect | `modules/shared/` (the modules' transform toolkit) |
| `lib/constants/{statuses,transitions}` + `lib/utils/evidence` | now the store is dumb, only the modules use them — no cross-layer agreement to keep | `modules/shared/` (tier knowledge belongs with the tiers) |
| `lib/constants/stages` | only `validate()` iterates the stage axis | `services/template/stages.ts` |
| `lib/utils/{envelope,args}` | the transport format + arg parsing are a cli concern | `cli/` (single consumer) |
| `services/config` (the name) | it manages *default ⊕ user* settings | renamed → `services/template` ( `{ steps, fields, validate, raw }` ) |
| `services/config/{resolve-steps,worker-dispatch}` + `plan-for` *algorithm* | the step order + worker are template DATA; nothing to compute | gone — `merge` handles overrides; `worker:` is inline template data; `steps()` is a trivial accessor (kills the engine residue + the deferred worker-dispatch item) |
| `services/config/config-schema/custom-fields` | the module owns its schema; only the data is config | `template.fields(tier)` (data) + a pure `extendSchema` helper in `modules/shared` |
| `services/config/init` (writes files) | a first-run EFFECT, not the pure loader | a separate first-run unit over `fs` |
| `services/store/validate` | a read-only settings inspection | folds into `template.validate()` (backs `anchored validate`) — no separate module |
| `cli/node-router` (slug facade) | routing is a direct tier lookup (tier-first grammar) | gone — `createCli` dispatch |
| `cli/tier-of` | not needed for routing (tier is explicit in the grammar) | gone |
| `cli/commands/{stage,node,lifecycle}/*` | the verb logic belongs to the tier | folds INTO each `createX` |
| `cli/anchored.ts` (createAnchored) | the assembly IS createCli | merged into `cli/cli.ts` |
| `domain/` (the whole layer) | dissolved already in v1 reshape | gone |

## Dependencies (decided in v1, carried forward)

- `proper-lockfile` — cross-process write lock. Keep.
- Zod **v4** has native `z.toJSONSchema()` → drop the old `zod-to-json-schema` for the
  `# yaml-language-server: $schema=…` header.
- `write-file-atomic` evaluated + rejected: no CAS, which is the real guard against the
  parallel epic fan-out. Hand-built atomic write stays.
