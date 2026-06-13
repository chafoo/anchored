# Rule: Fractal Integrity — Mechanism vs. Policy, Invariant in the Substrate

> Scope: Engine, substrate, schema, state, default template. Non-negotiable.

## Mechanism (Code, fixed) vs. Policy (Config, swappable)

- **Mechanism = deterministic code**: the tier form, state machine +
  transitions (forward-only), the hard invariant, atomic-writes, audit-trail,
  the tier mechanics (status enum, child relationship). Lives in `domain/`,
  `store/`, `orchestration/`, `store/codec/`, `store/io/io.ts`, the mechanics half of
  `domain/tiers/*`.
- **Policy = Config/Template, swappable**: WHAT happens in each stage (the
  step sequences) + the `fields` (data-model shape). Lives in the default template
  (`anchored.default.yml`) + the user deltas in `anchored.yml`.

When you are deciding where something belongs: behavior the user should be able to
reconfigure → policy (step/field). A guarantee that must never break → mechanism.

## No privileged built-ins

All opinionated behavior (implement, validators, scaffold, decompose …) is
a **step** in the default template — active by default, fully overridable/replaceable.
No step is hardcoded in the engine code. The engine dispatches config-driven
(`resolve-steps` fills in defaults); it knows no concrete step names.

## Hard invariant (in the data model, not in a step)

**An `ac` only goes to `status: done` when `evidence` is present.** Enforced in
`domain/invariants/invariants.ts` at the writing op — NOT in a step that could be omitted.
"Everything configurable" holds, WITHOUT losing the core value.

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
