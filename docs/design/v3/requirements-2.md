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
   typed by `lib/contracts/` (`StorePort`, `TemplatePort`). The module imports only the
   *interface*; `createCli` injects the implementation. The inversion holds — a module
   still never imports a concrete service.

3. **A module may depend on another module — by contract.** The real case: epic's roll-up
   must read its child *task files*; rather than re-bind the store to task's schema, epic
   demands `task: Tier` in its `deps` and calls `task.get(childSlug)`. `createCli` injects
   it. Never a sibling concrete import — so the tiers compose without coupling, and epic
   (the top tier) need not know task's internals.

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
     isEvidenceFilled(ac.evidence))` — defined ONCE in `modules/shared/fragments.schemas.ts`, reused
     by every tier schema. Because `store.write` runs `schema.parse` on every write, the
     rule is unskippable *without the store knowing what evidence is*. (No `invariants`
     service file.)
   - **Transitions are a pure helper the module calls.** `assertTransition(map, from, to)`
     + the maps live in `modules/shared/transitions.ts` (tier knowledge — only modules use
     it now that the store is dumb). Not the store's concern, and not `lib` either.

5. **The `template` service (the second service) manages the configurable policy.**
   `createTemplate({ readDefault, readUser }) → { steps(tier,stage), fields(tier),
   validate(), raw() }`. It merges the shipped default template (`anchored.default.yml`)
   with the user's `anchored.yml` ONCE, validates against `ConfigSchema`, and answers
   per-tier/stage what the **steps** and **custom fields** are. Crucially: **the step
   order + the worker per step are DATA in the template** (`{ name: implement, worker:
   build-implement }`), so `steps()` is a trivial accessor — there is **no plan algorithm,
   no resolve-steps, no worker-dispatch code, no engine**. The lifecycle is configurable
   because it is template data; `template` only loads + merges + serves it. It does **not**
   orchestrate (the skill does) and does **not** plan (the data *is* the plan). Named
   `template` because its job is literally *default template ⊕ user overrides*.
   - `validate` is **not a separate module** — it is `template.validate()`, backing the
     `anchored validate` meta-command.
   - The DATA of custom fields comes from `template.fields(tier)`; **applying** them
     (extending the module's schema) is a pure helper in `modules/shared` the module calls
     (the module owns its schema).

6. **`cli/` is just assembly + routing.** `createCli` instantiates the two services
   (`store`, `template`), then each tier factory (injecting deps), and returns the model.
   Dispatch is a **direct lookup**: the api.md grammar is tier-first (`anchored <tier>
   <verb> [slug]`), so `argv → modules[tier].run(verb, rest) → envelope`. The meta-verbs
   (`validate` → `template.validate()`, `help` → render the tiers' surface) are handled in
   `cli` directly. No `node-router`, no file-shape derivation for routing. `envelope` (the
   transport JSON) + `args` (argv parsing) are `cli`-local — single consumer.

7. **`lib/` is tiny: contracts + `error`, nothing else.** Something earns a `lib` slot only
   if it **crosses a layer boundary** (a contract) OR is needed by **literally every layer**
   (`error`). "Pure" alone does not qualify. So `lib/` = `contracts/` (the five ports: `fs`,
   `store`, `template`, `tier`, `cli`) + `utils/error.ts`. There is **no `constants/`** —
   the tier axes (statuses · transitions · the evidence predicate) live in `modules/shared`
   (only modules use them once the store is dumb), `stages` lives in `services/template`,
   `envelope`/`args` in `cli`. Single-consumer ⇒ colocate; `lib` stays the pure boundary.

## What `createCli` looks like

```ts
// cli/cli.ts — instantiate services, then the tier factories (DI), return the model + route.
function createCli(deps) {                          // deps = the seams from bin.ts (fs · lock · yaml · readers)
  // ── the two services (generic mechanisms — know no tier) ──
  const store    = createStore({ fs: deps.fs, lock: deps.lock, yaml: deps.yaml })  // read/write a node, validated by a given schema
  const template = createTemplate({ readDefault: deps.readDefault, readUser: deps.readUser })  // default ⊕ user · merge once · steps/fields/validate

  // ── modules: each a factory, DI'd ONLY the contracts it demands (may demand another module) ──
  const phase   = createPhase({ store, template })
  const task    = createTask({ store, template })
  const epic    = createEpic({ store, template, task })    // epic (top tier) reads child task files in roll-up — task injected
  const tiers   = { phase, task, epic }

  // ── route: tier-first grammar → direct lookup; meta-verbs handled here ──
  return async (argv) => {                                 // argv → modules[tier].run(verb, rest) → JSON envelope
    const [tier, verb, ...rest] = argv
    if (verb === undefined && tier === 'validate') return emit(template.validate())
    if (tier === 'help') return print(help(tiers))          // help = the union of the tiers' verb surfaces
    return emit(await tiers[tier].run(verb, rest))
  }
}
```

## What a tier factory looks like

```ts
// modules/epic/epic.ts — a factory: owns the rules AND the verbs, built on the injected store.
import type { StorePort }  from '../../lib/contracts/store.js'    // DEMANDS a store (contract, never concrete)
import type { TemplatePort } from '../../lib/contracts/template.js'
import { assertTransition, lifecycleTransitions } from '../shared/transitions.js' // tier knowledge — modules' base
import { EpicSchema } from './phase.schemas.js'   // the tier's schema — carries the evidence refine; the law the store enforces

export function createEpic(deps: { store: StorePort; template: TemplatePort }) {
  const { store, template } = deps
  const read  = (slug)       => store.read(slug, EpicSchema)
  const write = (slug, node) => store.write(slug, node, EpicSchema)   // store runs schema.parse → evidence enforced

  return {
    // lifecycle (template-driven plan — the steps are template DATA, served not computed)
    plan:   (input) => ({ node: …, steps: template.steps('epic', 'plan') }),
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
| `services/store/invariants` | the service must not know what evidence is | dissolved — the rule is a Zod `.refine` in `modules/shared/fragments.schemas.ts` (the schema is the law) |
| `services/store/transitions` | a pure per-tier-data guard, not a service | `modules/shared/transitions.ts` (maps + `assertTransition`); the module calls it |
| `services/store/{children,questions,log}` | pure transform helpers, no effect | `modules/shared/` (the modules' transform toolkit) |
| `services/config` (the name) | it manages *default ⊕ user* settings | renamed → **`services/template`**: `createTemplate({ readDefault, readUser }) → { steps, fields, validate, raw }` |
| `services/config/bootstrap` + `plan-for` | one loader, split across files today | merged into `services/template/template.ts` (load + merge + serve) |
| `services/config/resolve-steps` | inserting defaults is what `merge`(template, user) already does | gone — the template *is* the defaults |
| `services/config/worker-dispatch` (code map) | the worker per step is policy DATA, not code | inline in each template step (`worker: build-implement`); `template.steps()` serves it. Kills the deferred item + the engine residue |
| `plan-for` as an *algorithm* | the data is the plan; nothing to compute | trivial accessor `template.steps(tier,stage)` |
| `services/store/validate` | a read-only settings inspection | folds into **`template.validate()`** (backs the `anchored validate` meta-command) — not a separate module |
| `services/config/config-schema/custom-fields` | the module owns its schema; only the *data* is config | `template.fields(tier)` returns the data; a pure `extendSchema` helper in `modules/shared` applies it |
| `services/config/init` (writes files) | a first-run EFFECT, not the pure loader | a separate first-run unit over `fs` (not inside `template`) |
| `services/config/step.ts` `tierNames` | only the config schema validates tier keys | stays with `services/template/config.schemas.ts` |
| `lib/constants/{statuses,transitions}` + `lib/utils/evidence` | the store is dumb now → only modules use them | `modules/shared/` (tier knowledge belongs with the tiers) |
| `lib/constants/stages` | only `validate()` iterates the stage axis | `services/template/stages.ts` |
| `lib/utils/{envelope,args}` | transport format + arg parsing are a cli concern | `cli/` (single consumer) |
| `cli/node-router` (slug facade) | routing is a direct tier lookup now (tier-first grammar) | gone — `createCli` dispatch |
| `cli/tier-of` | not needed for routing (tier is explicit) | gone |
| `cli/commands/{stage,node,lifecycle}/*` | the verb logic belongs to the tier | folds INTO each `createX` |
| `createAnchored` (in `cli/anchored.ts`) | the assembly IS `createCli` | merged into `cli/cli.ts` |

## The one trade-off this resolves (supersedes rule 6)

`requirements.md` rule 6 chose a single generic verb kernel fed pure-data conditions. We
are reversing that: the tiers are **not** uniform (epic carries task-STUBS, phase carries
real ACs + evidence, epic rolls up), so the generic kernel pays for its DRY-ness
with ugly `if (tier === …)` branches in one ~600-LOC function. The factory model keeps the
genuinely-generic part (`store`: safe read/write validated by a schema) shared, and
**encapsulates each tier's specifics in its own factory** — common CRUD is a trivial
read/transform/write, so there is no duplication. Better locality, the inversion intact.
And because the only universal guard (evidence) lives in the *schema*, the store stays
dumb: it never learns what a tier is.

## Colocation, files & suffixes

### Colocation (folders) — carried over from `colocation-and-naming.md`, holds for v3

- **A lone file needs no folder.** The moment it gains a companion (a spec, a
  `.schemas.ts`, a `.fake.ts`, a `scope/` helper) it moves into **its own folder**, and the
  main file is **named after the folder** (`phase/phase.ts`, `store/store.ts`) — never
  `index.ts`.
- **The companion suffixes ARE what triggers the folder.** `phase.ts` alone → flat;
  `phase.ts` + `phase.schemas.ts` + `phase.spec.ts` → `phase/` folder. (So the suffix axis
  below and the folder rule are the same convention seen from two sides.)
- **Spec sits next to its subject;** deeper local helpers live in `scope/`.
- **No barrels** — import directly from the source module
  (`from '../services/store/store.js'`), never an aggregating re-export file. The **one**
  exception is the package entry `core/src/index.ts` (re-exporting the public surface — the
  published boundary, not an internal aggregation).

### File & suffix conventions

Two **orthogonal** axes. A file carries at most one *content* suffix; the *test-kind*
suffix is the separate concern of [[test-file-naming]].

```
foo.ts            # the implementation — LOGIC ONLY (no type/schema declarations)
foo.types.ts      # hand-written types (interfaces · unions · fn signatures) for foo
foo.schemas.ts    # Zod schemas for foo + their z.infer types (a schema + its type stay together)
foo.fixtures.ts   # shared test DATA for foo's tests (sample nodes · sample YAML)
foo.fake.ts       # a reusable test DOUBLE of foo (an in-memory impl of its port)
foo.spec.ts       # unit         ┐
foo.int.ts        # integration  ├ the test-kind axis (unchanged)
foo.e2e.ts        # end-to-end   ┘
```

Rules:
- **The impl `.ts` declares no exported types or schemas** — it imports them from its
  `.types.ts` / `.schemas.ts` sibling. (A trivial one-off *local* type may stay inline.)
- **A `z.infer` type lives WITH its schema** in `.schemas.ts`, never split into `.types.ts`
  — a schema and its derived type are one unit. So types are split by *origin*:
  schema-derived → `.schemas.ts`, hand-written → `.types.ts`. Either way the impl file
  stays type-free.
- **`lib/contracts/*` are exempt** — they ARE the boundary type files; they stay bare in
  `contracts/` (no `store.types.ts`). The folder is the signal.
- **`.schemas.ts` attaches to a subject** (`phase.ts` → `phase.schemas.ts`). A standalone
  schema-only file with no impl sibling (e.g. the shared fragments) is named for its
  content (e.g. `modules/shared/fragments.schemas.ts`).
- **`.fake.ts` lives next to the real impl it doubles** (`services/store/store.fake.ts`),
  build-excluded like the specs; any spec may import it.
- Rejected (not needed): `.const.ts` (local constants live in a well-named file like
  `stages.ts`), `.errors.ts` (one shared `anchoredError`), `.guards.ts` (guards are plain
  functions; `.schemas.ts` covers validation data).

> Promote to `.claude/rules/colocation-and-naming.md` + `test-file-naming.md` when the
> rebuild lands.

## Status

Design note — agreed in discussion 2026-06-14, **not yet built**. The current `core/src`
still has the v1 pure-condition + generic-kernel + `node-router` + `config` shape. This is
the spec for the next refactor; `lib/` stays, `services` collapses to two dumb services
(`store` + `template`), the tier behaviour moves into the module factories, and `cli/`
collapses to assembly. The whole step-plan engine (resolve-steps/worker-dispatch/plan-for)
dissolves — the step order + worker are template DATA, not code.
