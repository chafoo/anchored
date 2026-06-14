# anchored v3 — requirements + decisions

Decision record for the v3 rewrite. Companion to `architecture.md` (the code layout)
and `api.md` (the CLI surface). This file captures the **why** + the binding rules we
agreed; `architecture.md` reflects the resulting structure.

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

6. **The verb mechanics are generic; the verb *surface* is module-declared.** The
   mutation mechanics (read→transform→validate→atomic-write, addChild/addAc via the
   descriptor's child-field) live once in the generic service. WHICH verbs a tier exposes
   (epic→`child`, phase→`ac`) is part of the module's condition bundle; the orchestrator
   reads it to know the cli surface for `<tier>`.

7. **100% test coverage — non-negotiable.** Every file under `modules/` and `services/`
   (and `lib/`) carries a colocated spec (`*.spec.ts` unit / `*.int.ts` / `*.e2e.ts`,
   per the existing test-file-naming rule). Pure modules make this cheap. Add a coverage
   gate to the quality gates so a file without coverage blocks `done`. (Gap to close now:
   `lib/utils/error.ts`, `lib/constants/stages.ts` had no spec when relocated.)

8. **Project gets built out** (no longer a reserved stub). It is a fourth tier module
   with its own condition bundle, same lifecycle form. Proposed semantics: `project →
   epics` (childTier: `epic`). Confirm whether project needs anything beyond the uniform
   tier shape (e.g. a distinct roll-up). — OPEN.

## Open decisions (to confirm before the reshape lands)
- **Name of the condition bundle:** `condition` (used in discussion) vs `spec` / `rules`
  / `descriptor`. "condition" reads like a boolean; the bundle is broader (schema +
  transitions + child + completable). Leaning `spec`. — OPEN.
- **Generic kernel vs per-tier verbs:** agreed direction = generic kernel in the service
  + each module injects its conditions (rule 6). (This resolves the earlier A/B.)
- **Project semantics** (rule 8).

## Status of the rewrite (see `.claude/temp/v3-build-plan.md` for the live log)
Done + green on branch `v3-rebuild`: `lib/` (contracts·utils·constants), `services/store`,
`services/config`, `orchestration/` dissolved, steps folded into `plan-for`, shared error
primitive, store-internal invariants. Remaining: the coupled `modules/<tier>` +
generic-node-service + `cli/`-as-orchestrator reshape (this document is its spec), plus
the worker-dispatch → default-template dissolution.
