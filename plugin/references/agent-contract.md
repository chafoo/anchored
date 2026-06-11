# Agent-Contract — der Spawn-Input-Vertrag (Skill ⇄ Agent)

> Die eine Naht zwischen der **Skill** (Dirigent, in-session) und einem **Agent**
> (Effekt, via Task-Tool gespawnt). Beide Seiten referenzieren dieses Dokument,
> damit sie nicht aneinander vorbeiraten. CLI-only-Transport: der Agent liest +
> schreibt ausschließlich über die `anchored`-CLI, nie über rohe Write/Edit auf
> Task-Files (Source-Code-Dateien mutiert nur build-implement, via Write/Edit/Bash).

## Was die Skill jedem Agent durchreicht (Input)

Beim Spawn (Task-Tool) übergibt die Skill im Prompt mindestens:

| Feld | Bedeutung |
|---|---|
| `task-slug` | der **Task**-Slug (das Task-File). IMMER der Task, nie der Phasen-Slug. |
| `phase-slug` | (nur build/leaf) die Ziel-**Phase** innerhalb des Task-Files. |
| `tier` | `phase` \| `task` \| `epic` — auf welcher Etage gearbeitet wird. |
| `stage` | `plan` \| `refine` \| `build` \| `wrap` — welche Stage. |
| `context` | Prosa-Kontext: Phase-/Node-`context`, der `plan`-Trail, resolved questions. |
| `rules` | die `rules[]` der Phase/des Tasks (`{ path, why }`) — der Agent liest sie + hält sie ein. |
| `instructions` | optionale Step-`instructions` aus der (gemergten) Config — wörtlich durchgereicht. |

Die Skill ermittelt die Worker-Identität (welcher Agent) **nicht** hardcoded,
sondern aus `anchored steps <tier> <stage>` (→ `agent`-Ref pro worker-Step).

## Phasen-Adressierung (kritisch)

Eine **Phase ist ein Kind im Task-File** — sie hat KEIN eigenes Node-File. Darum
adressiert ein phase-level-Agent seine Schreibvorgänge über **`<task-slug>
<phase-slug>`**, nie als eigenständigen Node:

- Evidence pro Phasen-AC → `anchored node add-phase-evidence <task-slug> <phase-slug> <ac-id> "<beweis>"`
  — **Evidence am Symbol verankern, nicht an rohen Zeilennummern (H6):** führe mit
  der Funktion/dem Symbol/der Datei (`saveTasks() in app.js`), wo der Beweis lebt;
  eine Zeilennummer veraltet, sobald ein Geschwister-Task dieselbe Datei editiert —
  höchstens als nachgestellter Hinweis, nie als Anker.
- Phasen-Status setzen → `anchored node set-child-status <task-slug> <phase-slug> <status>`

Ein **node-level**-Agent (task/epic, z. B. wrap-summarize, epic-roll-up) adressiert
dagegen den Node über seinen eigenen `<slug>` (`set-field <slug> …`, `set-status
<slug> …`) — das ist sein eigenes File.

## Was der Agent zurück-/rausschreibt (Output = self-write via CLI)

Kein strukturierter Return den die Skill anwendet — der Agent **self-writet** sein
Ergebnis direkt via CLI. Pro Agent-Rolle:

| Rolle | self-write-Befehle |
|---|---|
| plan-discover / plan-rules-scan / refine-* / wrap-review / validators | `anchored node append-log <task-slug> <stage> <kind> "<note>"` |
| plan-decompose | `anchored node add-phase <task-slug> <phase-slug> "<name>"` · `anchored node add-ac <task-slug> <phase-slug> "<text>"` (id auto a1,a2,…) |
| epic-scaffold | `anchored node add-child <epic-slug> <task-stub-slug>` |
| build-implement | `anchored node add-phase-evidence <task-slug> <phase-slug> <ac-id> "<beweis>"` (evidence-only — Symbol-Anker; flippt NIE den Phasen-Status selbst, G4) |
| build-task-validate / build-code-validate | pure inspector (kein Code-Write); REJECT einer AC via `anchored node set-failures <task-slug> <phase-slug> <ac-id> "<why>"` (flippt sie pending → Re-Do-Loop) + Rollup via `append-log … build learning` |
| wrap-summarize | `anchored node set-field <node-slug> context.wrap "<TL;DR>"` (dotted-path → nested) |
| epic-roll-up | `anchored node append-log <epic-slug> wrap <kind> "<DoD/Retro>"` · `anchored node set-status <epic-slug> done` |

Jeder Agent-Doc nennt am Kopf die Felder, die er erwartet, + die Befehle, die er
ausführt — dieser Vertrag ist die gemeinsame Referenz. Wenn ein Agent ein Feld
braucht, das hier nicht steht, ist das ein Vertrags-Update (hier), nicht ein
stilles Raten.
