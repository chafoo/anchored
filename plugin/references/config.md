# anchored.yml — Konfigurations-Format

> Referenz für das `anchored.yml`-Format. Die vollständige Default-Config liegt in
> [`default.yml`](default.yml) (von dort liest anchored alle Defaults). Eine echte
> User-`anchored.yml` enthält **nur Deltas** — was sie nicht überschreibt, kommt
> aus der gemergten Default-Basis. Beispiel-Nodes: [`task.example.yml`](task.example.yml),
> [`epic.example.yml`](epic.example.yml).

## Aufbau: Tiers × Stages × Steps

Top-Level sind die **Tiers** (`phase` · `task` · `epic` · `project`). Jeder Tier
hat dieselben vier **Stages** (`plan` · `refine` · `build` · `wrap`), jede Stage
eine geordnete `steps`-Liste.

```yaml
task:
  plan:    { steps: [ … ] }
  refine:  { steps: [ … ] }
  build:   { each: phase, stop: [ … ], retry_limit: 3, steps: [ … ] }
  wrap:    { steps: [ … ] }
```

- **`build`** trägt zusätzlich `each` / `stop` / `retry_limit` als Geschwister von
  `steps` (siehe unten).
- Lässt du eine Stage oder `steps` weg → die Built-in-Defaults laufen.
- Top-Level ist **strict**: unbekannte Keys → Fehler.

## Ein Step

Ein Step ist ein Eintrag in `steps`. Pflicht ist `name`; alles andere hängt vom
Typ ab.

| Feld | Built-in step | Custom `run:` step | Custom `use:` step |
|---|---|---|---|
| `name` | **Pflicht** (reservierter Name) | **Pflicht** | **Pflicht** |
| `run` | ✗ | **Pflicht** (Shell/Prosa) | ✗ |
| `use` | ✗ | ✗ | **Pflicht** (Worker) |
| `type` | ✗ | ✗ | optional · `agent` (default) \| `skill` |
| `instructions` | optional (steuert den Built-in) | — | optional (an den Worker) |
| `involve` | nur auf `walk` · `all`\|`high-only`\|`none` | ✗ | ✗ |
| `each` (+`steps`) | nur auf `loop` (siehe unten) | ✗ | ✗ |

**Invarianten:** `run` **XOR** `use` (nie beides) · `type`/`instructions` nur mit
`use` · Built-ins haben weder `run` noch `use` (dispatchen sich selbst) · Built-ins
sind **nicht entfernbar/umsortierbar** — nur per `instructions` erweiterbar (append).

```yaml
# Built-in, nur gesteuert:
- { name: implement, instructions: "always TDD: red → green → refactor" }

# Built-in walk mit involve:
- { name: walk, involve: high-only }

# Custom run-step (Shell):
- { name: lint, run: 'npm run check' }

# Custom use-step, isolierter Subagent (default):
- { name: docu-scan, use: docu-scan }

# Custom use-step, Skill in der Session, mit Instruktion:
- { name: pr-review, use: pr-reviewer, type: skill, instructions: 're-scan touched modules only' }
```

### Variablen in `run:`-Steps

Der Orchestrator übergibt jedem `run:`-Step diese Werte als **echte
Umgebungsvariablen** (`${NAME}` im Shell-Command expandiert; nie selbst
hineintexten). Welche verfügbar sind, hängt von der Stage ab:

| Variable | Wert | Verfügbar in |
|---|---|---|
| `TASK_SLUG` | der Task (das Task-File); bei einem Epic-Kind der Kind-Slug | allen build/wrap-`run:`-Steps |
| `PHASE_SLUG` | die gerade gebaute Phase | nur `phase.build` |
| `PHASE_NAME` | der Klartext-Name der Phase | nur `phase.build` |
| `EPIC_SLUG` | der Eltern-Epic-Slug, sonst leer | allen build/wrap-`run:`-Steps |

Es gibt **kein** `$SLUG` — der korrekte Name ist immer `${TASK_SLUG}`. Eine
Commit-Message wie `git commit -am "$SLUG"` committet still mit **leerer**
Message.

> **branch-per-task — Slug flachklopfen:** ein Epic-Kind-Slug ist *nested*
> (`myepic/core-list`). Ein roher Branch `task/${TASK_SLUG}` kann mit einem
> prefix-verwandten Geschwister kollidieren (git-Ref-D/F: `task/x` vs `task/x/y`).
> Im Branch-Namen Slashes zu `-` machen, dann ist der Name kollisionssicher:
> ```bash
> BRANCH="task/$(printf '%s' "${TASK_SLUG}" | tr '/' '-')"   # myepic/core-list → task/myepic-core-list
> ```

### Position: `after:` / `before:`

Ein Custom-Step wird per `after: <step-name>` oder `before: <step-name>` relativ
zu einem bestehenden (Built-in-)Step einsortiert; ohne Anker wird er **ans Ende
angehängt**. Beim Merge mit dem Default-Template gilt: Steps mergen *keyed by
name* + extend-only — ein neuer Name landet an der Anker-Position, ein bekannter
Name erweitert den bestehenden Step in-place.

```yaml
phase:
  build:
    steps:
      - { name: commit, after: code-validate, run: '…' }   # NACH den Gates, auf grüner Phase
      - { name: lint,   before: task-validate, run: '…' }  # VOR dem Evidence-Gate
```

> **Achtung — stiller Append:** zeigt `after:`/`before:` auf einen Namen, den es
> in der Stage nicht gibt, schlägt das **nicht** fehl — der Step landet kommentarlos
> am Ende (`ok:true`). Nach dem Editieren mit `anchored steps <tier> <stage>` die
> tatsächliche **Reihenfolge** prüfen, nicht nur die Präsenz.

## Built-in-Steps pro Stage

Reservierte `name`-Werte, vom Framework erkannt (nicht entfernbar):

| Stage | phase (Leaf) | task | epic |
|---|---|---|---|
| `plan` | — | `discover` · `rules-scan` · `decompose` | `discover` · `scaffold` |
| `refine` | — | `plan-check` · `rules-check` · `walk` | `walk` |
| `build` | `implement` · `task-validate` · `code-validate` | `each: phase` | `each: task` |
| `wrap` | — | `review` · `summarize` | `roll-up` |

> Reserviert/Tabu für *eigene* Worker-Namen: `plan`, `explore` (CC-interne
> Agent-Typen).

## `each`, der Loop-Step

Ein `build`, der Kinder iteriert, nutzt einen `loop`-Step mit `each: <tier>`. Der
Loop hat einen **Body** (`steps`), der **interleaved** pro Kind läuft (Kind A
komplett, dann Kind B …):

```yaml
epic:
  build:
    steps:
      - { name: notify-start, run: '…' }      # einmal, vor dem Loop
      - name: loop
        each: task                            # Loop-Body = die task-Etage, pro Stub
        steps:
          - { name: run }                      # built-in: diese Einheit fahren
          - { name: commit, run: 'git commit -am "${TASK_SLUG}"' }  # direkt danach, pro Task
      - { name: report, run: '…' }            # einmal, danach
```

- **Kurzform** `build: { each: task }` ≙ `steps: [{ name: loop, each: task, steps: [run] }]`.
- `each` ist **intrinsisch** (pro Tier fix: task→phase, epic→task, project→epic) —
  nur Doku, nicht frei wählbar.
- Per-Iteration-Mechanik (Status fortschreiben, log, `stop`-Check) ist built-in.

### `stop` + `retry_limit`

Geschwister von `steps` im `build` (Policy des Loops, keine Steps):

```yaml
build:
  each: task
  stop:                                       # natürlichsprachige Halt-Conditions; hält beim ersten Match
    - 'an architectural boundary is crossed (layer, DAG, contract)'
  retry_limit: 3                              # so oft wird eine fehlschlagende Einheit neu gefahren
```

## Felder (`fields`)

Jeder Tier trägt ein Daten-Modell. Die **Default-Felder** pro Tier stehen in
[`default.yml`](default.yml) (Shape) — die Mechanik (Status-Enum, Transitions) ist
fix im Code. Beispiel-Belegung: [`task.example.yml`](task.example.yml) /
[`epic.example.yml`](epic.example.yml).

> **Harte Invariante (nicht abschaltbar):** ein `ac` geht nur auf `done`, wenn
> `evidence` vorliegt. *Wie* die Evidence entsteht, konfigurierst du frei.

### Ein eigenes Feld hinzufügen

Custom-Felder werden an der **Etage** deklariert, der sie gehören — unter deren
`fields`, als **Record** (`name: typ`, KEINE Liste von `{name, type}`):

```yaml
phase:
  fields:                                     # Custom-Felder der phase-Etage
    coverage_pct: number                      # z.B. eine Zahl pro Phase

task:
  fields:
    commit_sha: string                        # Custom-Feld auf dem Task-File
    ticket_url: string
```

- **Record-Form, nicht Liste:** `commit_sha: string` ✓ — `- { name: commit_sha,
  type: string }` ✗ (das Schema erwartet eine Map `name → typ`).
- `typ`: `string` | `number` | `boolean` (skalar getypt) — alles andere wird als
  `unknown` durchgelassen (permissiv, aber persistiert).
- Default-Felder werden **nicht** hier wiederholt — `fields` ist **additiv**
  (die Basis kommt aus `default.yml`); ein Custom-Name landet zusätzlich im
  Node-Schema, ein **un**deklarierter Key wird beim Schreiben weiterhin abgelehnt.
- Setzen/Lesen zur Laufzeit: `anchored node set-field <slug> <name> <value>`.
  Auf einem **Kind** (Stub/Phase): `anchored node set-child-field <slug> <child>
  <name> <value>`.

## `_lib` — wiederverwendbare Steps (nur `anchored.yml`)

YAML-Anchors sind **auf dem `anchored.yml`-Pfad erlaubt** (user-authored Config),
um Steps wiederzuverwenden. Node-Files bleiben no-alias.

```yaml
_lib:
  research: &research
    name: research-best-practices
    use: researcher
    instructions: "Aktueller Code zuerst (.claude/rules + docs), dann online."

epic:
  plan:
    steps:
      - *research                             # per Alias wiederverwendet
      - { name: scaffold }
```

## Woher die Defaults kommen

`effectiveConfig = merge(default.yml [Framework-Basis], <project>/anchored.yml
[Deltas])` — einmal beim Bootstrap geladen, als `deps.config` in die Engine
injiziert. Darum reicht eine minimale User-Datei.
