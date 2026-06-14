# Rule: Fractal Integrity — Mechanism vs. Policy, Invariant in the Substrate

> Scope: Engine, substrate, schema, state, default template. Non-negotiable.

## Mechanism (Code, fixed) vs. Policy (Config, swappable)

- **Mechanism = deterministic code**, split by who owns what:
  - **The DUMB store** (`services/store/store.ts`, on the `fs`/`lock`/`yaml` seams) —
    load/persist a node *safely* (yaml ⇄ object · atomic temp+rename, lock + CAS),
    validated against **a schema it is handed**. It knows no tier, no evidence, no
    transition. The schema is the only law.
  - **The tier FACTORIES** (`modules/<tier>/<tier>.ts` = `createX(deps) → Tier`) — own
    their tier's verbs + the tier-specific guards (the transition map, the completion
    floor, stub enums, roll-up). Each verb is a pure transform passed to `store.write`.
  - The cross-tier pure base (schema fragments · status/transition axes · assertTransition ·
    child/question/log transforms) lives in `modules/shared/`; `lib/` is contracts + the
    `error` primitive only.
- **Policy = Config/Template, swappable**: WHAT happens in each stage (the step sequences,
  with the worker INLINE per step) + the `fields` (data-model shape). Lives in the default
  template (`anchored.default.yml`) + the user deltas in `anchored.yml`, merged + served by
  the `services/template` service (a trivial accessor — no plan algorithm).

When you are deciding where something belongs: behavior the user should be able to
reconfigure → policy (step/field). A guarantee that must never break → mechanism.

## No privileged built-ins

All opinionated behavior (implement, validators, scaffold, decompose …) is
a **step** in the default template — active by default, fully overridable/replaceable.
No step is hardcoded in the engine code; the worker for each step is INLINE template DATA.
`template.steps(tier,stage)` serves the steps verbatim — no resolve-steps, no
worker-dispatch, no plan algorithm. The engine knows no concrete step names.

## Hard invariant (in the SCHEMA, not in a step, not even in a service)

**An `ac` only goes to `status: done` when `evidence` is present.** This is a UNIVERSAL
substrate rule, and it lives in the SCHEMA: a Zod `.refine` on the shared
`AcceptanceCriterion` fragment (`modules/shared/fragments.schemas.ts`, over the pure
`isEvidenceFilled` predicate). Because the dumb store runs `schema.parse` on **every**
write, the rule is unskippable — *without the store ever knowing what evidence is*.
Defined ONCE, reused by every tier schema; never duplicated into a verb or a step.

## Engine = deterministic, AI = effect behind `spawn`

Control flow (which stage/step), transitions, `retry`, `stop`, atomic-writes,
invariant = pure, tested code. AI workers are **effects** that the engine
triggers via the injected `spawn` dep. Never AI calls directly in the
control flow — always behind the seam (fakeable in the test).

## v1 is reference, not port

`~/Dev/anchored/mcp/src` is procedural + MCP-driven. Use it as a **logic
template** (how validation/transitions/render were intended), but **rewrite
everything anew in the factory pattern** ([[factory-functions]]). No copy-paste, no
1:1 port.

## Reference

`docs/design/fractal-lifecycle.md`, `docs/design/fractal-redesign-notes.md`
("Mechanism vs. Policy", "Hard invariant"). [[cli-only-transport]].
