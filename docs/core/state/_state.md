← [core](../_core.md)

# state

Die **Substrat-Mechanik**, die Integrität erzwingt: die forward-only
State-Machine + die harte Invariante. Beides greift in den mutierenden
[ops](../ops/_ops.md), nicht in einem Step — so kann es kein Config weg-schalten.

```mermaid
flowchart LR
    op["set-status / add-evidence"] --> t["transitions · forward-only?"]
    op --> i["invariants · evidence da?"]
    t -. "illegal" .-> e1["throw"]
    i -. "done ohne evidence" .-> e2["throw"]
```

| Unit | Verantwortung |
|---|---|
| [transitions](transitions.md) | Per-Tier forward-only State-Machine + `assertTransition`. |
| [invariants](invariants.md) | Die harte Invariante: kein `done` ohne `evidence`. Anchoreds Versprechen. |
