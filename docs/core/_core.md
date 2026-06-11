← [anchored](../_anchored.md)

# core

Das CLI-/Engine-Paket — die **deterministische** Hälfte von anchored. Lädt die
Config, fährt den fraktalen Lifecycle, mutiert die Node-Files atomar und erzwingt
die Integritäts-Invariante. AI-Arbeit wird nur als Effekt über `spawn` getriggert
(Engine = Code, AI = Effekt).

```mermaid
flowchart TB
    cli["cli · anchored &lt;verb&gt;"] --> config["config · anchored.yml bootstrap"]
    config --> engine["engine · tier/stage/step runner"]
    engine --> ops["ops · createNodeOps"]
    engine --> spawn["spawn · claude -p"]
    ops --> schema["schema · step/config/tiers"]
    ops --> state["state · transitions + invariante"]
    ops --> parser["parser · YAML ↔ node"]
    parser --> io["io · atomic-write"]
```

| Bereich | Verantwortung (Scope-Grenze) |
|---|---|
| [config](config/_config.md) | Bootstrap der Base-Dependency: `merge(default-template, user anchored.yml)` → `effectiveConfig`, einmal beim Start. |
| [engine](engine/_engine.md) | Die fraktale Factory-Engine — fährt `plan/refine/build/wrap` pro Knoten; `each` rekursiert in die Kind-Etage. |
| [ops](ops/_ops.md) | Tier-generischer Op-Kern: create/read/status/children/questions/log über *jeden* Node. |
| [schema](schema/_schema.md) | Zod-Schemas: Step-Grammatik, `anchored.yml`, Tier-Deskriptoren. |
| [state](state/_state.md) | State-Machine (forward-only) + die **harte Invariante** (kein `done` ohne `evidence`). |
| [parser](parser/_parser.md) | YAML ↔ Node (zwei Parse-Profile), block-scalar-Render + Schema-Directive. |
| [io](io.md) | `atomic-write` (lock + mkdir + POSIX-rename). Einzel-File. |
| [spawn](spawn.md) | Ausführungs-Substrat: `claude -p` pro Task-File, Phasen in-process. Einzel-File. |
| [cli](cli/_cli.md) | Der `anchored`-Befehl — einziger Transport (kein MCP). `plan/refine/build/wrap` + generische Node-Verben. |
| [wiring](wiring.md) | Composition-Root: `index.ts` (reine Factory `createAnchored`) + `bin.ts` (einziger Effekt-Ort). Verdrahtet das Substrat in deps-Graph-Reihenfolge. |

> **YAGNI**: Die Modul-Seiten bilden das **schon entschiedene** Design ab
> (eingearbeitet aus [docs/design/](../design/)) — nur so tief, wie festgelegt.
> Tiefere Impl-Details (micro: Schemas, Signaturen, Enums) folgen **mit dem Code**,
> nicht vorgebaut.
