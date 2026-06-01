# Offene Fragen — mcp/src/core

| Frage | Vorschlag | Entscheidung | Status |
|---|---|---|---|
| **Warum bekommen nur die field-Ops `fieldDeps` (config), alle anderen Ops nur `{ root }`?** — *Was an Custom-Fields hängt an `anchored.yml`, das die übrigen Mutationen nicht brauchen?* | In `core/ops/field.ts` prüfen, wie `config` konkret genutzt wird, und den Grund dort dokumentieren. | Bestätigt: field-Ops sind **schema-getrieben** — sie validieren/coercieren die in `anchored.yml.task.phase.fields` deklarierten Custom-Felder; andere Ops arbeiten allein auf der Task-File-Struktur. 3-Zeilen-Kommentar in `factory.ts:199` ergänzt, [factory.md](../mcp/src/core/factory.md) dokumentiert es. | entschieden |
