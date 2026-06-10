# Anchored Fraktal-Redesign — Arbeitsnotizen

> Status: Design-Phase (Stand 2026-06-10). Begleit-Drafts:
> `docs/drafts/fractal-lifecycle.md` + `docs/drafts/anchored.default.yml`.
> Diese Notiz hält fest, *was* besprochen + entschieden wurde und *wie* wir es
> bauen. Lebt unter `.claude/temp/` (Working-Doc, nicht final).

## Die große Wende

anchored wird ein **fraktales, pures Framework**:

- **EINE** Lebenszyklus-Form — `plan → refine → build → wrap` — gilt auf
  **jeder** Etage.
- **4 Etagen (Tiers)**: `project ▸ epic ▸ task ▸ phase` (project erst später).
- **Keine privilegierten Built-ins mehr.** Alles ist ein Step. Das opinionierte
  Verhalten (implement, Validatoren, scaffold …) ist das **Default-Template**
  (`anchored.default.yml`) — aktiv by default, voll überschreib-/ersetzbar.
- **Mechanismus vs. Policy:**
  - *Mechanismus* (Substrat, fix): Etagen-Form, State-Machine, Daten-Modell
    (`fields`), atomic-writes, Audit-Trail.
  - *Policy* (Steps, austauschbar): WAS in jeder Stage passiert.

## Harte Invariante (Substrat, nicht abschaltbar)

Ein `ac` geht nur auf `done`, wenn `evidence` vorliegt. → anchoreds Versprechen
(„keine Aussage ohne Prüfung") sitzt im **Datenmodell**, nicht in einem Step.
Damit ist „alles konfigurierbar" wahr, **ohne** die USP zu verlieren.

## Transport: CLI-über-Bash — ENTSCHIEDEN (MCP raus)

- **Entscheidung (2026-06-10, Option A)**: MCP komplett raus. *Alle* Ops laufen
  über die `anchored`-CLI, aufgerufen via **Bash**. Begründung (vom
  CC-Guide bestätigt): MCP-in-Subagents ist kaputt (#13605, kein Fix/Flag);
  CC-Built-ins sind nativ + für Plugins nicht erweiterbar; **Bash ist der
  einzige ubiquitäre Tool** (Main-Session *und* Subagents). Ein CLI-über-Bash
  verhält sich faktisch wie ein Built-in.
- **Folge**: der pure-thinker-Workaround fällt weg — Agents lesen + schreiben
  direkt via `anchored …`. Ein Transport, ein Mental-Modell, CI-/headless-fähig.
- **Core-Factory bleibt** der Wert (Schema, State-Machine, atomic-writes,
  Invariante) — nur transport-agnostisch hinter der CLI.
- **Friktion**: `Bash(anchored *)`-Allowlist via lazy-init in
  `.claude/settings.local.json`; CLI gibt JSON aus.

## Das Modell

- Jede Etage = Top-Level-Block mit `plan/refine/build/wrap`; jede Stage =
  `steps`-Liste.
- `build.each: <tier>` = fraktale Kante, **intrinsisch** (pro Tier fix, nicht
  konfigurierbar, nur Doku). `build` ohne `each` = Leaf (`phase`) → läuft einmal.
- `stop` + `retry_limit` = Eigenschaften eines **loopenden** `build`.
- `fields` **pro Etage** = Daten-Modell (Default + Custom über denselben
  Mechanismus). Ersetzt den globalen `_fields`-Bucket.
- Step-Grammatik unverändert: `name` + (`run` XOR `use`+`type`) +
  `instructions`; `involve` auf `walk`. Markdown-Content = YAML block-scalar
  (`|`), kein Mix — Parser/Renderer können das heute schon.

### Default-Steps + Felder pro Tier (= `anchored.default.yml`)

- **phase**: build=[implement, task-validate, code-validate]; plan/refine/wrap
  leer. fields: name, slug, status, context, rules, acceptance_criteria,
  evidence, failures.
- **task**: plan=[discover, rules-scan, decompose]; refine=[plan-check,
  rules-check, walk]; build=each:phase + stop + retry_limit:3;
  wrap=[review, summarize]. fields: schema_version, slug(kebab|nested), title,
  created, status, context.{plan,refine,build,wrap}, questions,
  decisions(view), log, phases.
- **epic**: plan=[scaffold]; refine=[walk]; build=each:task + stop +
  retry_limit; wrap=[roll-up]. fields: schema_version, slug, title, status,
  goal, acceptance, questions, tasks(stubs), log.
- **project** (später): scope / walk / each:epic / roll-up.

## Plan-Entry + Epic/Task-Klassifikation (Item 1 — ENTSCHIEDEN)

- **Entry**: `/impl-plan <epic|task>? <plan: prosa | path>`. Tier-Argument
  optional.
- **Ohne Tier**: `discover` → `classify` (Empfehlung) → User bestätigt → dann
  Strukturierung der gewählten Etage.
- **`discover`** = geteilter plan-Auftakt an *beiden* Tiers:
  `epic.plan = [discover, scaffold]`, `task.plan = [discover, rules-scan, decompose]`.
- **`classify`** = Routing-Logik im Entry-Skill, **kein** persistierter Step.
- **Struktur-Definition**: `task` = 1 Task-File (`.claude/tasks/<slug>.yml`) mit
  Phasen; `epic` = mehrere Task-Files unter `_epic.yml`
  (`.claude/tasks/<epic>/<slug>.yml`).
- **Erkennung** = Phasenzahl (Tripwire) + Unabhängigkeits-Test (Urteil):
  - `<5` Phasen → default `task`
  - `5–9` → Unabhängigkeits-Test („braucht jede Einheit eigenen
    plan→refine→build→wrap?"); bei Ja → `epic`
  - `≥10` → splitten (`epic`), User kann override
- **Eskalation `task → epic`** ist fraktal billig (Lift um eine Etage:
  Phase→Task, Task→Epic, gleiche Shapes). Auto-Eskalation mid-build = **v2**;
  manuell (re-plan) für v1.

## `anchored.default.yml` = die Grundlage

Der MCP muss so gebaut sein, dass er **alles** aus `anchored.default.yml`
umsetzen kann — jeder Step, jedes Feld, jede Stage dort ist eine konkrete
Anforderung an die Engine + das Substrat. Das Default-File ist der Vertrag.

## Ablage / Rollen

- `anchored.default.yml` → mitgelieferte **Referenz** (`plugin/references/`),
  **nicht** ins User-Projekt kopiert (Defaults sind unveränderlich → Kopie wäre
  Rauschen + Drift).
- lazy-init → **minimales** `anchored.yml` (Schema-Directive + Pointer auf die
  Referenz).
- **Standard-User**: braucht's nie (zero-config). **Power-User**: liest's zum
  Verstehen. **Setup-AI**: liest's als Spec, um die Delta-`anchored.yml` für den
  User zu generieren (Onboarding ohne Format-Lernen).

## Offen (zu entscheiden)

1. **steps-neben-each-Semantik**: Loop als positionierbarer Built-in-Step
   (`{ name: loop, each: task }`); custom steps davor/danach; Per-Kind-Logik in
   die Kind-Etage. → zu bestätigen.
2. **Ops-Namespace**: separate `task`/`epic` CLI-Gruppen ODER tier-generischer
   Kern mit per-Tier-Surfaces, jetzt wo alles fraktal ist? → zu entscheiden.
3. **Ausführungs-Substrat des Loops**: führt `build.each` jede Kind-Einheit als
   in-process **Task-Subagent** (leicht, session-gebunden, beobachtbar) ODER als
   headless **`claude -p`-Instanz** (echte Isolation, CI-/skriptfähig, aber
   teurer + verschachtelte Prozesse) aus? → zu entscheiden.

## Parkplatz (Ideen, später)

- **PreToolUse-Hook als Integritäts-Guard**: rohe `Write`/`Edit` auf
  `.claude/tasks/**` + `_epic.yml` verweigern → erzwingt, dass alle Mutationen
  durch die validierende CLI gehen. Für jetzt geskippt. (Subagent-Hook-
  Propagation noch offen.)

## Was sich am bestehenden System ändert

- **Funktional für den User**: `task`/`phase`-Verhalten bleibt gleich.
- **Intern**: Engine wird tier-generisch (ein Loop-Mechanismus für alle Etagen);
  Built-ins → Template-Steps (config-driven dispatch statt hardcoded);
  Substrat-Invariante neu; `anchored.yml`-Schema flach → fraktal; `fields` pro
  Tier; `epic` ist „ein Tier höher" mit eigenen Steps + Daten.

## Agent-Roster + Buckets (Item 4 — ENTSCHIEDEN)

- CC unterstützt **keine Agent-Unterordner** (nur flach in `agents/`, verifiziert
  via CC-Guide). → Bucketing über **Namens-Präfix**, nicht Ordner.
- Der Roster ist ein **flacher Satz distinkter Worker**, benannt nach dem was sie
  tun:
  - **geteilt / tier-parametrisiert** (1 File, Tier+Input reingereicht):
    `discover`, `plan-check`, `rules-check`, `walk`, `review`, `summarize`.
  - **tier-spezifisch** (eigene Files): `decompose`(task), `scaffold`(epic),
    `scope`(project), `implement`/`task-validate`/`code-validate` (nur
    Leaf/phase), `roll-up`(epic).
- Höhere `build`-Tiers haben **keinen** Worker — ihr build ist der `each`-Loop
  (Orchestrierung). Echte Code-Worker nur am Leaf.
- Präfix-Schema nach Stage wo sinnvoll (`plan-…`, `refine-…`, `build-…`,
  `wrap-…`, `epic-…`).

## Engine-Architektur (Item 3 — ENTSCHIEDEN)

Detail + Diagramme: `docs/drafts/engine-architecture.md`.

- **Fraktale Factory-Functions** (trader-Pattern): `createEngine` →
  `createTierRunner` → `createStageRunner` → `createStepRunner`, jede als
  `createX(cfg, deps) → { run(input) → output }`; Helfer im `scope/`-Ordner.
- **Zwei Fraktale gleiche Form**: Runtime (tier→stage→step) + Code; `loopStep`
  schließt die Rekursion (ruft `createTierRunner` der Kind-Etage).
- **Trennung**: Engine = deterministischer Code (Kontrollfluss, State-
  Transitions, retry, stop, atomic-writes, Invariante). **AI-Worker = Effekte**
  hinter injizierter `spawn`-Dep (agent | `claude -p`) → austausch-/fakebar.
- **Substrat bleibt** (`createOps`, parser, validate, io); `spawn` ist die neue
  Dep. Eine `createTierRunner` bedient epic/task/phase — Unterschied ist nur
  `cfg` (aus `anchored.default.yml`) + `node` (Daten).
- Ordner: `core/engine/{engine,tier-runner,stage-runner,step-runner}.ts` +
  `core/engine/scope/{run-step,worker-step,loop-step,resolve-steps}.ts`.

## Ausführungs-Substrat (Item 2 — ENTSCHIEDEN)

- **`spawn` = headless `claude -p`**, Granularität **pro Task-File** (jedes
  Task-File = eine frische Instanz), **Phasen in-process** innerhalb dieser
  Instanz → Verschachtelung gedeckelt bei ~2.
- `spawn` bleibt **injizierte Naht** → ein in-process Task-Subagent-Modus (Live-
  Progress, session-gebunden) kann später als zweite Implementierung dazukommen,
  ohne die Runner anzufassen.
- Konsistent mit q6: Task läuft isoliert/epic-blind; Cross-Task-Kontext
  (epic-log-Auszug) kommt als Argument rein.
- Preis akzeptiert: volle Instanz pro Task (Startup/Tokens); Headless-Auth muss
  laufen (kein interaktiver Login zur Laufzeit).

## steps/each-Semantik (Item 5a — ENTSCHIEDEN)

- `each: <tier>` ist ein **Step-Attribut**, nicht build-Stage-Level.
  `build.each: task` ist nur **Kurzform** für einen einzelnen `loop`-Step.
- Der `loop`-Step hat `each` **+ einen `steps`-Body**, der **interleaved** pro
  Kind läuft: alle Body-Steps für Kind A, dann für Kind B (A→run→commit,
  B→run→commit, …). NICHT das Pass-Modell (erst alle run, dann alle commit).
- Im Body ist `{ name: run }` der built-in „diese Einheit fahren"-Step
  (headless spawn), um den herum custom Steps positionierbar sind.
- Per-Iteration-Mechanik (Status fortschreiben, log, stop-check) macht die
  `loopStep` nach dem Body jeder Iteration — built-in.
- Kurzform `build: { each: task }` = loop mit implizitem Body `[run]`.
- Engine: `loopStep` reused `stepRunner` auf den Body → fraktal, eine Ebene tiefer.
  Detail in `docs/drafts/engine-architecture.md`.

## Ops-Namespace + Config-as-Base-Dep (Item 5b — ENTSCHIEDEN)

- **Tier-generischer Op-Kern**: ein `createNodeOps(tierSchema, deps)`,
  parametrisiert über einen Tier-Schema-Deskriptor. Nach außen **lesbare
  per-Tier-CLI-Surfaces**: `anchored task|epic|phase <verb>`. Supersedet q21
  (strikt getrennt) — Logik einmal, nicht 3× dupliziert; project gratis dazu.
- **Tier-Schema-Deskriptor = Code-Mechanik + Config-Felder**:
  - *Code/Substrat (fix)*: Status-Enum, State-Machine-Transitions, Kind-Beziehung
    (task→phase), harte Invariante (kein `done` ohne `evidence`).
  - *Config (anchored.yml)*: die Felder (Shape) — Default-Felder aus
    `anchored.default.yml` + User-Custom-Felder, beim Laden gemerged. Baut auf der
    bestehenden `_fields`/phase-Field-Maschinerie auf.
- **`anchored.yml` ist *die* Base-Dependency**:
  `effectiveConfig = merge(anchored.default.yml [Framework-Basis], <project>/anchored.yml [User-Deltas])`
  — einmal beim **Bootstrap** geladen + validiert, dann als `deps.config` in alle
  Factory-Functions (createEngine / createOps / …) injiziert. Darum reicht die
  minimale User-`anchored.yml`: nicht-Überschriebenes kommt aus der Default-Basis.

## v2-Repo + Command-Naming (ENTSCHIEDEN/geklärt)

- **v2 = neues Repo `~/Dev/anchored-v2`** (Clean-Slate-Rewrite). v1 bleibt live
  auf npm/Marketplace, bis v2 steht (dann neuer `main` / Major-Bump). Kein
  In-Place-Umbau am laufenden v1.
- **Naming (vom CC-Guide verifiziert)**:
  - `/plan` ist ein **Built-in** (Plan-Mode); `/refine`/`/build`/`/wrap` derzeit
    frei aber generisch.
  - Agent-Typen **`Plan` + `Explore` sind reserviert** → custom Agents *nie* so
    nennen (Shadowing). Unser Roster meidet das.
  - Plugin-Commands/Skills sind **immer namespaced** (`/anchored:…`), Built-ins
    nicht überschreibbar.
  - **ENTSCHIEDEN — Plugin-Name `a`** (Fallback `anc`, falls einbuchstabige
    Plugin-Namen nicht erlaubt → beim Scaffold verifizieren). Command-Surface:
    ```
    /a:plan   <epic|task|phase>?  <prosa|path>   # Tier optional → sonst classify
    /a:refine <slug>                              # Tier aus dem Node abgeleitet
    /a:build  <slug>
    /a:wrap   <slug>
    ```
  - **Keine separaten Tier-Entries** — der Tier ist Argument von `plan`.
  - Stage-Wort bleibt **`plan`** (Wiedererkennbarkeit; via Namespace `/a:plan` eh
    kollisionsfrei). `refine/build/wrap` bleiben. Agents weiterhin nie
    `plan`/`explore` nennen (reservierte Agent-Typen).

## Plan forward

- `impl-epic-layer` (Status: refined) ist inhaltlich **überholt** — beschreibt
  noch die alte Built-in-Welt. → zurück auf `drafted` + Neuaufsetzen, ODER neue
  Vorstufen-Task „pure engine + substrate + default template", dann `epic`
  obendrauf.
- **Supersedes** aus dem alten Plan: q2 (Built-ins fix), q5 (plan→task Rename —
  `plan` bleibt `plan`), Teile von q17.
