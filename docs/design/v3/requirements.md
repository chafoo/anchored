# anchored v3 — requirements + decisions

Decision record for the v3 rewrite. Companion to `architecture.md` (the code layout)
and `api.md` (the CLI surface). This file captures the **why** + the binding rules we
agreed; `architecture.md` reflects the resulting structure.

> **⚠️ `requirements-2.md` is the current authoritative model — read it first.**
> The four-layer tree (`lib → modules → services → cli`), contracts-as-seams, the evidence
> invariant, and 100% coverage still hold — but most of the *internals* below are
> superseded by v2:
> - **Modules** become **active factories** (`createEpic(deps)`) that own their verbs and
>   receive services by DI (supersedes rule 6's generic kernel).
> - **services** collapse to two dumb mechanisms: `store` (`read/write` a node validated by
>   a given schema — no `io`/`codec`/`invariants`/`node-store`) and `template` (`config`
>   renamed — merge + serve settings; the whole step-plan engine dissolves into template
>   *data*).
> - **The evidence invariant lives in the SCHEMA** (a Zod `.refine`), not a service.
> - **`lib/` shrinks to `contracts/` + `error`** — no `constants/`; the tier axes move to
>   `modules/shared`, `stages` to `template`, `envelope`/`args` to `cli`.
>
> The shipped code (pure bundles + `node-store` kernel + `node-router`/`commands/` +
> `config`) is the migration source, **not** the target.

## The shape: four layers, dependency one-way

```
lib/         primitives — zero special knowledge, the base everyone may use
   ▲ imported by everyone, imports nothing
modules/     tier units (epic·task·phase·project) — PURE tier knowledge ("conditions")
   ·         import ONLY lib (utils + contracts). NEVER import a service.
services/    generic effectful mechanism (node/store). Knows NO concrete tier —
   ·         receives the tier conditions via DI. Imports ONLY lib.
orchestrator the cli — the single composition root (a factory fn). Wires modules'
(cli/)       conditions + the services together via DI, dispatches <tier>.
```

**The core inversion:** modules and services never import each other. A module is a
**pure knowledge unit** (what a tier is, how it works, when it is satisfied); a service
is a **generic mechanism** that is *told* the tier rules. They meet only at the
orchestrator, by dependency injection. This makes a module trivially testable (pure
functions) and a service tier-agnostic.

## Binding rules

1. **`lib/` = the base.** Three buckets, all zero-dependency-on-the-rest:
   - `lib/contracts/` — the port interfaces (io · store · config · tier · cli). The only
     cross-boundary surface; imported as *interfaces*, implementations never.
   - `lib/utils/` — pure primitives with **no special knowledge** and no internal deps
     (e.g. `error.ts` = the typed-error factory, pure predicates, id/path helpers).
   - `lib/constants/` — fixed values (e.g. `stages.ts` = the lifecycle stage axis).
   `lib/` imports nothing internal; everyone may import `lib/`.

2. **`modules/<tier>/` hold the tier's conditions.** A module owns, as **pure data +
   pure functions**, everything tier-specific: its schema, its legal transitions, its
   child relationship, and *when it is satisfied/complete*. This is the module's scope —
   **no one outside needs to know how a tier works internally.** A module imports only
   `lib/` (utils + contracts). It performs **no I/O** (no store, no io). It exposes a
   condition bundle the orchestrator injects into the generic service.

3. **`services/` are generic + DI-fed.** The node/store service is one tier-generic
   read-modify-write kernel. It knows no concrete tier; it receives the tier conditions
   via a factory, e.g. `createNodeOps({ epic, task, phase, project }, deps)` (or a
   `const nodeConditions = { epic, task, phase, project }` injected at the root). It
   imports only `lib/`. The codec (yaml⇆node) is service-internal (it has the yaml dep +
   `$schema` knowledge — NOT a util).

4. **`cli/` is the orchestrator** — a factory fn (`createAnchored(deps)`) at the very
   top that builds the services, collects each module's conditions, injects, and
   dispatches `<tier>`. Following trader's orchestrator convention: the `cli/` folder may
   hold all the internal sub-modules the cli needs (the function-splits that happen
   during dispatch) — they live inside `cli/`, not pulled out, since only the cli uses
   them. This is the ONE place a contract meets its implementation.

5. **Universal substrate rules stay generic — not per-module.** The hard invariant
   *"an ac may only be `done` with evidence"* is **universal across all tiers**. It lives
   ONCE in the service/lib (the store's write-path guard), NOT duplicated into each
   module. Only genuinely per-tier knowledge (schema · transitions · child-relationship ·
   tier-specific completability) belongs in a module. Do not copy the evidence invariant
   four times.

6. **The verb mechanics are generic; the verb *surface* is module-declared.**
   **⚠️ SUPERSEDED by `requirements-2.md`.** v1 put ALL verb mechanics in one generic
   kernel fed pure-data conditions. v2 reverses this: only the read→transform→validate→
   atomic-write RMW stays generic (`store.for(condition) → { read, mutate }`); the
   per-verb *transforms* move into each tier's **factory** (`createEpic`), so
   tier-specifics (roll-up, stub-vs-AC) are encapsulated, not branched in a god-function.
   _(original v1 text:)_ The mutation mechanics live once in the generic service; WHICH
   verbs a tier exposes is part of the module; the orchestrator reads it for the `<tier>`
   surface.

7. **100% test coverage — non-negotiable.** Every runtime file under `modules/` and
   `services/` (and `lib/`) carries a colocated test (`*.spec.ts` unit / `*.int.ts` /
   `*.e2e.ts`, per the test-file-naming rule). Pure modules make this cheap. **DONE:** a
   structural coverage gate ships (`core/scripts/spec-coverage.sh`, wired as the first
   step of `npm test`) — a source file with no colocated test (basename-prefixed, so an
   aspect spec counts) blocks the gate. The interface-only `lib/contracts/*` carry
   conformance specs (tsc is their real gate; the specs catch interface drift). Only
   `bin.ts` (the effect shell) and `index.ts` (the package re-export) are spec-exempt.

8. **Project gets built out** (no longer a reserved stub). **DECIDED + DONE:** project is
   the fourth tier module (`modules/project/`) with its own condition bundle, on the SAME
   uniform `plan→drafted→refined→build→wrap→done` lifecycle as task/epic (the old reduced
   `planning/building/done` is gone). Semantics: `project → epics` (childTier `epic`),
   carrying epic STUBS as its loop-queue exactly as epic carries task-stubs — no distinct
   roll-up shape; the uniform tier form suffices. Tier-derivation detects `epics[]` →
   project.

## Resolved decisions
- **Name of the condition bundle:** `condition` (the user's term). Each `modules/<tier>`
  exports the bundle named after the tier (`export const task = { … }`); collectively the
  orchestrator injects them as `conditions = { phase, task, epic, project }`. The bundle
  type is `TierCondition` (`lib/contracts/tier.ts`); `TierDescriptor` is a back-compat
  alias. The bundle is broader than a boolean — schema + statusValues + transitions +
  defaultStatus + child relationship (childField/childStatusValues/childTerminalOk/
  childExecutorValues).
- **Generic kernel vs per-tier verbs:** generic kernel in the service, each module
  injects its conditions (rule 6). `createNodeOps(condition, deps)` reads every
  tier-specific fact off the injected bundle — no module import, no hardcoded child maps.
- **Project semantics:** rule 8 above.

## Status of the rewrite — COMPLETE on branch `v3-rebuild`
The reshape this document specifies has landed, all gates green:
- `lib/` — contracts (io·store·config·tier·cli ports) · utils (error · evidence predicate)
  · constants (stages · statuses · transitions axes).
- `modules/<tier>/` — phase·task·epic·project as PURE condition bundles (+ `shared/schema`
  fragments); import only lib; no I/O.
- `services/` — `store` (generic node kernel fed conditions via DI, codec, io, invariants,
  transitions, children, questions, log, validate) + `config` (bootstrap, merge, plan-for,
  resolve-steps, schema, worker-dispatch).
- `cli/` — the orchestrator: `anchored.ts` (`createAnchored` = the single composition root)
  + dispatch (`cli.ts`) + the dissolved slug-facade (`node-router/`) + tier-derivation
  (`tier-of/`) + commands. `index.ts` re-exports the public surface.
- `domain/` — fully dissolved.

Remaining (optional, intentionally deferred): the worker-dispatch → default-template
dissolution (a behaviour-preserving relocation of the step→worker map from
`services/config/worker-dispatch/` into `anchored.default.yml`; flagged for an attended
pass since it touches the config merge + data flow).
