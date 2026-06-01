← [commands](_commands.md)

# CLI-Subcommand-Katalog

Vollständige Nachschlage-Referenz aller CLI-Subcommands über die 5 Command-Gruppen (`task` / `phase` / `ac` / `context` / `field`) — je Eintrag: voller Command-Pfad, Positional-Args, Flags und Zweck.

## task (`task.ts`)

| Command | Positional-Args | Flags | Zweck |
|---|---|---|---|
| `task create` | `<slug>` | `--title <title>` (required), `--intro <intro>` (optional) | Legt eine neue Task-Datei unter `.claude/tasks/<slug>.yml` an. |
| `task read` | `<slug>` | — | Gibt die vollständige Task-Datei als YAML aus. |
| `task status set` | `<slug> <status>` | — | Transitioniert den Task-Status (state-machine-enforced); `status` via `TaskStatus.parse`. |
| `task title set` | `<slug> <title>` | — | Benennt die Task um (nur Titel — Slug ist immutable). |
| `task question add` | `<slug>` | `--text <text>` (required), `--priority <level>` (required: `low\|medium\|high`), `--origin <agent>` (required: `plan-agent\|plan-check\|rules-check\|task-validate\|code-validate\|stop-check\|user`), `--phase <phase-slug>` (optional) | Fügt eine neue Question hinzu; gibt die vergebene `q<N>`-Id aus. |
| `task question list` | `<slug>` | `--priority <level>` (`low\|medium\|high`), `--status <state>` (`open\|resolved`), `--phase <phase-slug>` — alle optional | Listet Questions (Insertion-Order) als JSON; filtert via Flags. |
| `task question resolve` | `<slug> <id>` | `--answer <text>` (required), `--source <who>` (required: `user\|ai`), `--reasoning <text>` (optional) | Löst eine Question per Id; `source=user` → kein reasoning, `source=ai` → reasoning erforderlich. |
| `task question retag` | `<slug> <id> <priority>` | — | Ändert die Priority einer existierenden Question; `priority` via `QuestionPriority.parse`. |

## phase (`phase.ts`)

| Command | Positional-Args | Flags | Zweck |
|---|---|---|---|
| `phase list` | `<slug>` | — | Listet die Phasen der Task (name, slug, status). |
| `phase next` | `<slug>` | — | Gibt den Slug der nächsten nicht-terminalen Phase aus (`in-progress\|pending`), sonst `no pending phases`. |
| `phase add` | `<slug>` | `--name <name>` (required), `--slug <phase-slug>` (required), `--after <phase-slug>`, `--before <phase-slug>`, `--to <start\|end>` (optional, default: end) | Fügt eine neue Phase hinzu; Position via `parsePhasePosition`. |
| `phase remove` | `<slug> <phase-slug>` | `--force` (optional) | Entfernt eine Phase; verweigert `done`-Phasen ohne `--force`. |
| `phase move` | `<slug> <phase-slug>` | `--after <phase-slug>`, `--before <phase-slug>`, `--to <start\|end>` (eine erforderlich) | Verschiebt eine Phase an eine neue Position; Fehler ohne Positionsflag. |
| `phase status set` | `<slug> <phase-slug> <status>` | — | Transitioniert einen Phasen-Status (state-machine-enforced); `status` via `PhaseStatus.parse`. |
| `phase name set` | `<slug> <phase-slug> <name>` | — | Benennt eine Phase um (nur Display-Name — Slug ist immutable). |
| `phase context set` | `<slug> <phase-slug> <content>` | — | Ersetzt den Context-String der Phase. |
| `phase rules set` | `<slug> <phase-slug> <rules-json>` | — | Ersetzt das Phasen-Rules-Array durch ein JSON-Array von `{ path, why }`-Objekten (`z.array(PhaseRule).parse(JSON.parse(...))`). |
| `phase retry increment` | `<slug> <phase-slug>` | — | Inkrementiert atomar `phase.retry_count`; gibt den neuen Wert aus. |

## ac (`ac.ts`)

| Command | Positional-Args | Flags | Zweck |
|---|---|---|---|
| `ac add` | `<slug> <phase-slug>` | `--text <text>` (required) | Hängt ein neues Acceptance-Criterion an die Phase an. |
| `ac remove` | `<slug> <phase-slug> <idx>` | — | Entfernt das AC am 0-basierten Index (`idx` via `parseIntArg`). |
| `ac text set` | `<slug> <phase-slug> <idx> <text>` | — | Schreibt den AC-Text in-place neu (status + evidence unverändert). |
| `ac evidence set` | `<slug> <phase-slug> <idx> <evidence...>` | — | Setzt Evidence (atomar: status → `done`, failures geleert); jedes `<evidence>`-Arg wird ein Array-Element. |
| `ac evidence add` | `<slug> <phase-slug> <idx> <line>` | — | Hängt eine Evidence-Zeile an (atomar: status → `done`). |
| `ac failures set` | `<slug> <phase-slug> <idx> <failures...>` | — | Erfasst Failures (atomar: status → `pending`, evidence als History erhalten). |
| `ac failures clear` | `<slug> <phase-slug> <idx>` | — | Leert das Failures-Array (status unverändert). |
| `ac status set` | `<slug> <phase-slug> <idx> <status>` | — | Setzt AC-Status auf `pending` (Full-Reset: löscht evidence + failures). Nur `pending` akzeptiert — `done` via `ac evidence set`. |

## context (`context.ts`)

| Command | Positional-Args | Flags | Zweck |
|---|---|---|---|
| `context intro set` | `<slug> <content>` | — | Ersetzt `context.intro` durch den Content. |
| `context plan append` | `<slug> <content>` | — | Hängt Content an `context.plan` an (trimmed, newline-joined). |
| `context plan resolve` | `<slug> <q-index> <resolution>` | — | Ersetzt den `q-index`-ten `→ ?`-Marker in `context.plan` durch `→ <resolution>` (`q-index` via `parseIntArg`). |
| `context build append` | `<slug> <subsection> <content>` | — | Hängt Content an `context.build[<subsection>]` an. |
| `context build set` | `<slug> <subsection> <content>` | — | Ersetzt `context.build[<subsection>]` durch den Content. |
| `context wrap intro set` | `<slug> <content>` | — | Ersetzt `context.wrap.intro` durch den Content. |
| `context wrap append` | `<slug> <subsection> <content>` | — | Hängt Content an `context.wrap.subsections[<subsection>]` an. |
| `context wrap set` | `<slug> <subsection> <content>` | — | Ersetzt `context.wrap.subsections[<subsection>]` durch den Content. |

## field (`field.ts`)

| Command | Positional-Args | Flags | Zweck |
|---|---|---|---|
| `field list` | — | — | Listet die in `anchored.yml` deklarierten Phasen-Felder (name, type); gibt `(no fields declared in anchored.yml)` bei leerer Liste. |
| `field set` | `<slug> <phase-slug> <name> <value>` | — | Setzt einen deklarierten Phasen-Feldwert (typ-coerced gegen `anchored.yml`). |
| `field get` | `<slug> <phase-slug> <name>` | — | Liest einen Phasen-Feldwert; gibt `null` aus, wenn unset. |

## Warum

- `ac status set` akzeptiert ausschließlich `pending` und wirft sonst einen Fehler — der Übergang nach `done` ist absichtlich nur über `ac evidence set` möglich, damit Status-Flip und Evidence-Array atomar gemeinsam gesetzt werden.
- `phase move` erfordert zwingend eines der Positionsflags (`--after`/`--before`/`--to`); fehlt es, wirft der Command `must pass --after, --before, or --to`. `phase add` hingegen erlaubt das Weglassen (Default: ans Ende).
- Reservierte Built-in-Keys (status, name, …) werden von `field set/get` abgelehnt — diese besitzen eigene typisierte Ops unter `phase ...`.
