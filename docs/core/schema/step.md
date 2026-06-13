← [schema](_schema.md)

# step

Die **Step-Grammatik** — bewusst strukturell. Ein Step ist die kleinste Einheit
einer Stage; das Schema erzwingt nur die Form, nicht die Built-in-Bedeutung.

## Was

- `name` (Pflicht) + optional `instructions` — letzteres an **jedem** Step-Typ
  erlaubt (run/use/worker): Prosa, die der Skill beim Ausführen/Dispatchen befolgt
  (uniform, kein Sonderfall).
- Genau eines: `run: '<cmd>'` **XOR** `use: '<worker>'` (+ optional
  `type: agent|skill`). Per Zod-Refinement erzwungen.
- `involve: all|high-only|none` — nur am `walk`.
- `each: <tier>` + optionaler `steps`-Body — am `loop`.
- `before: '<step>'` **XOR** `after: '<step>'` — positioniert den Step relativ zu
  einem benannten anderen Step (höchstens eins, per Refinement).
- **Reserved-Name-Semantik** (Built-in-Dispatch, kanonische Reihenfolge,
  Injektion) ist *nicht* hier, sondern in
  [resolve-steps](../engine/scope/resolve-steps.md).

## Wie

```mermaid
flowchart TB
    s["Step"] --> n["name + instructions?"]
    s --> x{"run XOR use"}
    x -->|run| r["run: cmd"]
    x -->|use| u["use: worker · type? "]
    s -. "loop" .-> e["each + steps?"]
    s -. "walk" .-> i["involve"]
    s -. "ordering" .-> b["before XOR after"]
```

## Warum

Strukturell + generisch zu halten macht das Schema wiederverwendbar; die
registry-abhängigen Checks (Reihenfolge, Injektion) brauchen ohnehin einen
eigenen Pass und gehören nicht ins Per-Step-Objekt.
