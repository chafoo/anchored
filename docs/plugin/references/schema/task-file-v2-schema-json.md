← [schema (published JSON)](_schema.md)

# Task-File v2 — JSON-Schema (publiziert)

Nachschlage-Referenz: die IDE-Validierungs-Projektion (JSON Schema Draft-07) der Zod-Quelle. Diese `.schema.json` validiert die geparste YAML-Struktur eines Task-Files; die autoritative, lebende Definition ist die Zod-Quelle unter [../../../mcp/src/schema/task-file-schema.md](../../../mcp/src/schema/task-file-schema.md) — hier wird nicht dupliziert, sondern nur das publizierte JSON-Schema-Format katalogisiert.

Wurzel: `$ref: "#/definitions/task-file-v2"`. `$schema`: `http://json-schema.org/draft-07/schema#`. `title`: `Anchored Task-File (v2)`. Root-Objekt: `additionalProperties: true` (benutzer-deklarierte Extension-Felder erlaubt).

## Top-Level-Properties (`definitions.task-file-v2`)

`required`: `schema_version`, `slug`, `status`, `created`, `title`, `context`, `phases`.

| Property | Typ | Werte / Constraint | Pflicht |
|---|---|---|---|
| `schema_version` | number | `const: 2` | ja |
| `slug` | string | `minLength: 1`, `pattern: ^[a-z][a-z0-9-]*$` | ja |
| `status` | string (enum) | `plan`, `drafted`, `refined`, `build`, `wrap`, `done` | ja |
| `created` | string | `pattern: ^\d{4}-\d{2}-\d{2}$` (ISO-Datum) | ja |
| `title` | string | `minLength: 1` | ja |
| `context` | object | siehe [context](#context) | ja |
| `phases` | array<object> | siehe [phases](#phases) | ja |
| `customSections` | object | `additionalProperties: { type: string }` (Map String→String) | nein |
| `questions` | array<object> | siehe [questions](#questions) | nein |

## context

`object`, `required: [intro]`, `additionalProperties: false`.

| Property | Typ | Constraint | Pflicht |
|---|---|---|---|
| `intro` | string | — | ja |
| `plan` | string | — | nein |
| `build` | object | `additionalProperties: { type: string }` (Map String→String) | nein |
| `wrap` | object | `additionalProperties: false`; Felder unten | nein |

`context.wrap`-Felder:

| Property | Typ | Constraint |
|---|---|---|
| `intro` | string | — |
| `subsections` | object | `additionalProperties: { type: string }` (Map String→String) |

## phases

`array`, deren Items `object` mit `required: [name, slug, status, acceptance_criteria]` und `additionalProperties: true` sind.

| Property | Typ | Werte / Constraint | Pflicht |
|---|---|---|---|
| `name` | string | `minLength: 1` | ja |
| `slug` | string | `minLength: 1`, `pattern: ^[a-z][a-z0-9-]*$` | ja |
| `status` | string (enum) | `pending`, `in-progress`, `done`, `blocked`, `deferred` | ja |
| `context` | string | — | nein |
| `rules` | array<object> | Item-Felder unten | nein |
| `acceptance_criteria` | array<object> | `minItems: 1`; Item-Felder unten | ja |
| `retry_count` | integer | `minimum: 0` | nein |

`phases[].rules[]`-Item: `object`, `required: [path, why]`, `additionalProperties: false`.

| Property | Typ | Constraint |
|---|---|---|
| `path` | string | `minLength: 1` |
| `why` | string | `minLength: 1` |

`phases[].acceptance_criteria[]`-Item: `object`, `required: [text, status]`, `additionalProperties: false`.

| Property | Typ | Werte / Constraint | Pflicht |
|---|---|---|---|
| `text` | string | `minLength: 1` | ja |
| `status` | string (enum) | `pending`, `done` | ja |
| `evidence` | array<string> | `items.minLength: 1`, `minItems: 1` | nein |
| `failures` | array<string> | `items.minLength: 1`, `minItems: 1` | nein |

## questions

`array`, deren Items `object` mit `required: [id, text, priority, origin, status, created_at]` und `additionalProperties: false` sind.

| Property | Typ | Werte / Constraint | Pflicht |
|---|---|---|---|
| `id` | string | `pattern: ^q[0-9]+$` | ja |
| `text` | string | `minLength: 1` | ja |
| `priority` | string (enum) | `low`, `medium`, `high` | ja |
| `origin` | string (enum) | `plan-agent`, `plan-check`, `rules-check`, `task-validate`, `code-validate`, `stop-check`, `user` | ja |
| `phase` | string | `minLength: 1`, `pattern: ^[a-z][a-z0-9-]*$` | nein |
| `status` | string (enum) | `open`, `resolved` | ja |
| `answer` | string | `minLength: 1` | nein |
| `source` | string (enum) | `user`, `ai` | nein |
| `reasoning` | string | `minLength: 1` | nein |
| `created_at` | string | `minLength: 1` | ja |
| `resolved_at` | string | `minLength: 1` | nein |

## Warum

`additionalProperties` ist bewusst uneinheitlich: das Root-Objekt und jedes `phases[]`-Item erlauben `true` (benutzer-deklarierte Extension-Felder bleiben gültig), während die strukturierten Teilobjekte `context`, `context.wrap`, `rules[]`, `acceptance_criteria[]` und `questions[]` auf `false` gesetzt sind — dort schlägt ein unbekanntes Feld die Validierung fehl. Dadurch ist `customSections` (Top-Level) das einzige typisierte Map-Feld für Freitext-Sektionen, obwohl Extension-Felder am Root prinzipiell auch direkt erlaubt wären.
