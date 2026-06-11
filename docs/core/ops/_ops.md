← [core](../_core.md)

# ops

Der **tier-generische Op-Kern** — die einzige Stelle, die Node-Files mutiert.
`createNodeOps(tierSchema, deps)` liefert eine Op-Fläche, die über *jeden* Knoten
(epic/task/phase) funktioniert; der `tierSchema` parametrisiert sie. Jede Mutation
folgt `read → validate → mutate → re-validate → atomicWrite`.

```mermaid
flowchart LR
    op["op(slug, …)"] --> rd["read"] --> v1["validate"]
    v1 --> mut["mutate"] --> v2["re-validate"] --> w["atomic-write"]
    v1 -. "invariante / transition verletzt" .-> err["throw"]
```

| Unit | Verantwortung |
|---|---|
| [node-ops](node-ops.md) | Die Op-Fläche: create/read/status/children/questions/log/evidence — generisch über `tierSchema`. |
| [facade](facade.md) | Die slug-basierte `NodeOpsFacade` der **CLI**: `slug→verb`, read→apply→persist. Hält die await-Glue. |
| [engine-ops](engine-ops.md) | Die `OpsLike` der **Engine**: re-read-vor-write, damit Worker-Evidence nie überschrieben wird. |
| [children](scope/children.md) | add/move/**next-child** (DAG-Auswahl des nächsten Kindes). |
| [questions](scope/questions.md) | add/resolve question (geteilte AC/Question-Form). |
| [log](scope/log.md) | append-only Log. |

> Nach außen lesbare per-Tier-Surfaces: `anchored task|epic|phase <verb>` — alle
> über *diesen* Kern. Kein separater Namespace pro Tier.
