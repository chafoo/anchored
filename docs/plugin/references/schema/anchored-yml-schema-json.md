← [schema (published JSON)](_schema.md)

# anchored.yml — Published JSON-Schema

Nachschlage-Referenz: vollständige Enumeration der Top-Level-Properties des veröffentlichten JSON-Schemas — die IDE-Validierungs-Projektion der Zod-Schema-Quelle.

Diese `.schema.json` (Draft-07, `title`: "Anchored project configuration (anchored.yml)") ist die generierte Projektion der autoritativen Zod-Definition. Sie dient ausschließlich der IDE-/Editor-Validierung von `anchored.yml`. Sachstand und Begründung stehen in der Zod-Quelle: [anchored-yml-schema.md](../../../mcp/src/schema/anchored-yml-schema.md). Annotierte Defaults: [default-config.md](../default-config.md).

Wurzel: `$ref` → `#/definitions/anchored-yml` (`type: object`, `additionalProperties: false`).

## Top-Level-Properties (`anchored-yml`)

Alle fünf sind optional; jede ist `additionalProperties: false`.

| Property | Typ | Default | Bedeutung |
|----------|-----|---------|-----------|
| `task` | object | `{ phase: { fields: [] } }` | Task-Datei-Konfiguration; enthält nur `phase` |
| `plan` | object | `{ steps: [] }` | Plan-Pipeline; enthält nur `steps` |
| `refine` | object | `{ steps: [], plan_check: {}, rules_check: {} }` | Refine-Pipeline |
| `build` | object | `{ steps: [], retry_limit: 3, implement: {}, task_validate: {}, code_validate: {}, stop_check: {}, stop: ["a decision deviates from the plan"] }` | Build-Pipeline |
| `wrap` | object | `{ steps: [] }` | Wrap-Pipeline; enthält nur `steps` |

## `task.phase.fields[]`

`task.phase` (`additionalProperties: false`, Default `{ fields: [] }`) hält die Array-Property `fields` (Default `[]`). Jedes Item (`additionalProperties: false`):

| Feld | Typ | Constraints | Required |
|------|-----|-------------|----------|
| `name` | string | `minLength: 1`, `pattern: ^[a-z][a-z0-9_]*$` | ja |
| `type` | string (enum) | `string` \| `number` \| `boolean` \| `enum` | ja |
| `values` | array<string> | — | nein |
| `default` | beliebig (`{}` = jeder Typ) | — | nein |

## Step-Item-Form (`plan`/`refine`/`build`/`wrap` → `steps[]`)

Identische Item-Struktur in allen vier Pipelines; `steps` Default `[]`, jedes Item `additionalProperties: false`:

| Feld | Typ | Constraints | Required |
|------|-----|-------------|----------|
| `name` | string | `minLength: 1` | ja |
| `run` | string | `minLength: 1` | nein |
| `use` | string | `minLength: 1` | nein |

## `refine` — weitere Properties

| Property | Typ | Default | Inhalt |
|----------|-----|---------|--------|
| `steps` | array<step> | `[]` | siehe Step-Item-Form |
| `plan_check` | object | `{}` | `instructions: string` (optional) |
| `rules_check` | object | `{}` | `instructions: string` (optional) |

## `build` — weitere Properties

| Property | Typ | Constraints | Default | Inhalt |
|----------|-----|-------------|---------|--------|
| `steps` | array<step> | — | `[]` | siehe Step-Item-Form |
| `retry_limit` | integer | `minimum: 1` | `3` | — |
| `implement` | object | `additionalProperties: false` | `{}` | `instructions: string` (optional) |
| `task_validate` | object | `additionalProperties: false` | `{}` | `instructions: string` (optional) |
| `code_validate` | object | `additionalProperties: false` | `{}` | `instructions: string` (optional) |
| `stop_check` | object | `additionalProperties: false` | `{}` | `instructions: string` (optional) |
| `stop` | array<string> | items `minLength: 1` | `["a decision deviates from the plan"]` | globale Stop-Conditions |

## Warum

`type` und `values` sind im JSON-Schema unkorreliert: `values` ist auch ohne `type: enum` zulässig, und `type: enum` erzwingt kein `values`. Eine solche Kopplung — wie auch der freie `default`-Typ (`{}`) — kann das JSON-Schema nicht ausdrücken; sie wird erst von der Zod-Quelle geprüft.
