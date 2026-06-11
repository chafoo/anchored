# Ticket: Funde aus dem ersten vollen Epic-Dogfood mit VCS-Customs (2026-06-12)

**Quelle:** Live-Lauf in anchored-test — `/a:setup` (VCS-Strategie) + voller
Epic-Lifecycle (`/a:plan` → `/a:refine` → `/a:build` → `/a:wrap`) auf der
Tasks-App. Lief end-to-end grün, deckte aber echte Lücken auf.

## Status der alten Fixes (gehalten?)

- **USP / Honesty-Gate** — GEHALTEN, exemplarisch: task-validate hat ein
  DOM-AC mit statischem Code-Trace zu Recht abgelehnt → echter Browser-E2E
  erzwungen. Genau wofür das Gate da ist.
- **D1/D2 (Epic-Lifecycle-Symmetrie, per-Task-Outcome-ACs, Roll-up)** —
  GEHALTEN: epic-decompose schrieb 8 Outcome-ACs + 1 Integrations-AC (e1),
  epic-plan-check fing den Spec-Fehler (#clear-completed fehlt real), Roll-up
  validierte 8/8 + e1 hart.
- **H4 (failures-reset + clear-failures)** — LIVE OK (dist war in der ersten
  Session stale → UnknownNodeVerb; nach Rebuild vorhanden). Lehre: dist muss
  nach jeder CLI-Änderung neu gebaut werden (npm-link zeigt auf core/dist).
- **VCS-Customs (Orchestrator run-steps)** — GEHALTEN: branch-per-task,
  commit-per-phase, merge-to-main (-X theirs) liefen über den ganzen Lauf.

## Neue Funde

### F1 — Custom-Node-Felder gar nicht persistierbar  ✅ GEFIXT
`task.fields.commit_sha` wird von der Config akzeptiert, aber NICHT ins strikte
Node-Schema durchgereicht → `set-field commit_sha` warf „Unrecognized key". Der
Kern-Wunsch des Users (Commit-SHA pro Task im Feld) war damit tot; der
Orchestrator wich auf `append-log` aus.
**Fix:** `schema/custom-fields.ts` erweitert das Tier-Schema (Parser + persist)
um die deklarierten Custom-Fields; bekannte Felder behalten ihren strikten
typisierten Check, undeklarierte Keys bleiben abgelehnt. Live + Unit bewiesen.

### F7 — config.md lehrt die FALSCHE `fields`-Form  ✅ GEFIXT
Doku zeigte `fields: - { name: x, type: string }` (Liste), das Schema will aber
einen Record (`x: string`). Der Setup-Skill produzierte erst die Listenform →
Schema-Fehler, musste nachbessern.
**Fix:** config.md auf die Record-Form korrigiert + Beispiel.

### F3 — `anchored plan <tier> <desc>` macht hässliche Slugs aus der ganzen Beschreibung  ✅ GEFIXT
Der Slug wurde aus dem vollen Beschreibungstext abgeleitet
(`tasks-app-aus-dem-leeren-vanilla-js-scaffold-ind`). Der Orchestrator musste
mehrfach das Node-File `rm`en und mit kurzer Beschreibung neu anlegen.
**Fix:** expliziter Slug als erstes Argument: `anchored plan <tier> <slug>
"<desc>"`.

### F2 — Kein CLI-Weg, `depends_on` (oder ein Kind-Feld) zu setzen  ✅ GEFIXT
`add-child` nahm nur `<slug> [goal]`; `set-field tasks.1.depends_on` scheiterte
(set-field indiziert keine Arrays). Die DAG-Kante musste per
`ANCHORED_TASKFILE_EDIT=1`-Direktedit gesetzt werden — und ein scaffold-Agent
behauptete fälschlich, sie gesetzt zu haben.
**Fix:** `add-child` nimmt jetzt `depends_on` (CSV 3. Arg); neuer Verb
`set-child-field <slug> <child> <field> <value>` für Kind-Felder.

### F5 — `anchored --version` → 0.0.0  ✅ GEFIXT
Version war nicht aus package.json verdrahtet.

### F8 — epic-scaffold-Agent-Verlässlichkeit  ✅ GEFIXT (Folge von F2)
Der Agent meldete eine gesetzte DAG-Kante, die nicht im File stand, und nutzte
das `goal` nicht. Mit F2 (add-child nimmt depends_on) bekommt der Agent den
echten Hebel; epic-scaffold.md schärft die Anweisung (depends_on + goal setzen,
danach per read verifizieren).

### F10 — `git add -A` im phase-commit-Step fegt fremde Untracked-Files mit  ✅ DOKU
Der erste Phasen-Commit hätte das ungetrackte Setup (anchored.yml, EPIC.md,
Plan-Files) mitgenommen; der Orchestrator musste vorher manuell auf main
committen. Lehre in config.md (VCS-Beispiel) + der anchored.yml-Vorlage.

### F9 — Maschinen-Vokabular leakt noch in den Chat  ⏳ BEOBACHTET
„DAG", „next-child", „each:task-Loop", „Gates", „ready-children", „executor"
tauchten im Chat auf. Der User hat es diesmal nicht moniert; H1/H2 greifen
größtenteils. Niedrige Priorität — Nachschärfung optional.

### F4 — dist-Staleness (erste Session: clear-failures UnknownNodeVerb)  ✅ KEIN BUG
Der npm-gelinkte CLI zeigt auf `core/dist` — nach jeder CLI-Änderung muss
`npm run build` laufen, sonst ist der live-CLI stale. Aktuell gebaut + verifiziert
(clear-failures live, alle F1-F5-Fixes in dist).

### F6 — Task-Node hat kein `goal`-Feld  ⏳ BEOBACHTET (nicht gefixt)
`set-field core-list goal …` warf „Unrecognized key". Unkritisch: der Child-JIT-
Plan seedet aus den Outcome-ACs, das goal lebt im Stub + plan-Trail. Niedrige
Priorität; bewusst nicht geändert (redundantes Feld).

## Eval (alle Fixes live bewiesen)
- F1: commit_sha-Feld end-to-end — live in anchored-test + im vollen Flow
  (branch → phase-commit → `set-field commit_sha` == HEAD ✓). Unit: 5 Tests.
- F2: add-child depends_on + set-child-field + DAG-Gating — Integration: 1 Test.
- F3: plan --slug → sauberer Slug — Integration: 1 Test.
- F5: `anchored --version` → 0.1.0.
- merge-to-main: im echten Dogfood-Run nachweislich durchgelaufen.
- Alle 5 Gates grün (208 Tests). core dist neu gebaut, Plugin v0.1.7.

## Prep — anchored-test ist startklar für morgen ✅
- Scaffold-Baseline (app.js-Stub, index.html, style.css) wiederhergestellt.
- `anchored.yml`: volle Customs — branch-per-task, commit-per-phase **mit
  funktionierendem commit_sha-Feld** (F1), merge-to-main (-X theirs),
  Slug-flatten-Guard. Live validiert (3 Stages parsen, Feld schreibt).
- Run-Task-Files ins `_archive` verschoben; Task-Branches gelöscht; nur `main`.
- Baseline-Commit `9988ffb`. **Morgen: Plugin v0.1.7 reinstall + /reload-plugins,
  dann `/a:plan EPIC.md`.** (CLI ist via npm-link + Rebuild bereits live.)
