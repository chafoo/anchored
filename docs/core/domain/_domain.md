← [core](../_core.md)

# domain

The **definition layer** — pure knowledge: tier shapes, the lifecycle, the step
grammar, the hard invariant, and the config schema. No effects, no I/O, no
spawning. It sits at the **bottom** of the dependency direction (`cli →
orchestration/store → domain`); domain depends on nobody.

```mermaid
block-beta
  columns 1
  block:def
    tiers["tiers · node shapes + tier derivation"]
    lifecycle["lifecycle · STAGES + forward-only transitions"]
    steps["steps · step grammar + resolve-steps"]
    invariants["invariants · no done without evidence"]
    config["config-schema · anchored.yml shape (Zod)"]
  end
```

| Area | Responsibility (scope boundary) |
|---|---|
| [tiers](tiers/_tiers.md) | Everything that *defines a node's shape and which tier it is* — the four tier descriptors (project/epic/task/phase) and the two derivations (`tierOfNode` from children, `makeTierFor` from the file). |
| [lifecycle](lifecycle/_lifecycle.md) | Everything that *defines the stage sequence and the legal status moves* — the canonical `STAGES` and the per-tier forward-only state machine. |
| [steps](steps/_steps.md) | Everything that *defines what a step is and how a stage's steps are resolved* — the step grammar, the resolved-plan types, and built-in default insertion + canonical ordering. |
| [invariants](invariants/_invariants.md) | Everything that *guards integrity in the data model* — the hard substrate rule (no `ac → done` without `evidence`) as pure predicates + throwing asserts. |
| [config-schema](config-schema/_config-schema.md) | Everything that *defines the shape of `anchored.yml`* (Zod) — the tier/stage blocks and config-declared custom-field threading. Definition only; the loader lives in `config/`. |

> **Why a definition layer.** Mechanism (the tier form, transitions, the
> invariant, the schema) is *fixed code* and lives here. Policy (which steps run,
> which fields exist) is *config* and lives in the default template. Keeping the
> definitions effect-free and dependency-free is what makes them swappable behind
> fakes and reusable by every layer above.
