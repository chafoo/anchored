← [schema](_schema.md)

# config

Das Schema der `anchored.yml` — die Form der Datei, die beim Bootstrap geladen +
gemerged wird. Tiers mit Stages, plus die `_`-Buckets.

## Was

- Top-Level: die Tiers (`phase`/`task`/`epic`/`project`), je mit Stages
  (`plan`/`refine`/`build`/`wrap`), je eine `steps`-Liste ([step](step.md)).
- `build` trägt zusätzlich `each` (intrinsisch), `stop`, `retry_limit` als
  Geschwister von `steps`.
- `_lib` (YAML-Anchors **erlaubt** auf diesem Parse-Profil) + custom `fields` pro
  Tier. Top-level **strict** (unbekannte Keys → Fehler).

## Wie

```mermaid
flowchart TB
    cfg["anchored.yml"] --> tiers["tiers: phase/task/epic/project"]
    tiers --> stages["plan/refine/build/wrap → steps[]"]
    cfg --> lib["_lib (anchors)"]
    cfg --> fields["fields (custom, pro Tier)"]
```

## Warum

Das User-File ist minimal (nur Deltas); die Default-Basis kommt aus dem
Default-Template. Zwei Parse-Profile (`anchored.yml` alias-ok, Node-Files
no-alias) — siehe [parser](../parser/_parser.md).
