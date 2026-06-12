# Ticket: Extensibility-Hardening — „beliebig erweitern ohne Code", test-verriegelt

**Motivation:** Der USP ist, dass User extrem umfangreiche `anchored.yml` bauen
(custom Steps + Felder in jeder Etage/Stage) OHNE Framework-Code anzufassen. Der
Dogfood deckte auf, dass diese Garantie nicht durchgängig erfüllt + nicht
test-verriegelt ist. Außerdem fehlt ein Validator, mit dem der Setup-Skill (und
der User) eine yml verlässlich prüfen kann.

## Befunde (Ausgangslage)
- Custom-Step-Dispatch existiert nur in **build + wrap** Skills — NICHT plan +
  refine (0 Treffer). „Web-Research in Plan → research-Feld" würde nicht feuern.
- **Kein `anchored validate`** — Validierung nur implizit über `anchored steps`
  (wirft ConfigError, crasht aktuell unschön via Bootstrap).
- Custom-Felder funktionieren (F1) für task; nicht test-abgedeckt für phase/epic.
- Keine geschlossene Test-Matrix (custom Step × Etage×Stage; custom Field × Etage).

## Status: D1–D4 ALLE erledigt ✅ (243 Tests grün)

- **D1 ✅** `anchored validate` — live bewiesen (valide → volle Shape, invalide →
  sauberes Error-Envelope statt Crash; bin.ts fängt ConfigError). Unit:
  validate.spec. Setup-Skill nutzt es als Abschluss-Check.
- **D2 ✅** plan + refine SKILLs dispatchen jetzt custom run/use-Steps + Variablen-
  Kontrakt (vorher 0 Treffer). Grep-Test.
- **D3 ✅** geschlossene Matrix: custom run-Step + use-Step in JEDER Etage×Stage
  (24 Tests), custom Field in phase/task/epic (3). extensibility-matrix.spec.
- **D4 ✅** umfangreiche Beispiel-yml `plugin/references/anchored.example-
  comprehensive.yml` (research→research-Feld in plan, TDD-implement-Instruktion,
  per-phase commit, custom Steps in allen 4 Stages, custom Felder pro Etage) —
  validiert via `anchored validate` + im Test gegen Defaults gemerged verriegelt.

## Deliverables (Original)
- **D1 — `anchored validate`**: lädt + merged + validiert die ganze anchored.yml,
  resolved alle Tier×Stage-Step-Pläne, listet custom Felder, meldet präzise Fehler
  (statt Bootstrap-Crash). Der Verifier für den Setup-Skill. + Test.
- **D2 — plan + refine dispatchen custom Steps**: die SKILLs führen `kind:'run'`/
  `kind:'use'`-Steps generisch aus (wie build/wrap), mit Variablen-Kontrakt. Damit
  feuern Steps in ALLEN 4 Stages. + Grep-Test.
- **D3 — geschlossene Test-Matrix**: custom run-Step resolved in jeder gültigen
  Etage×Stage; custom Field schreibt/liest in phase/task/epic; end-to-end. + Tests.
- **D4 — umfangreiche Beispiel-anchored.yml** als Fixture in anchored-v2: Web-
  Research-Step in plan → `research`-Feld, commit, und die ARCHITEKTUR-INSTRUKTION
  = **TDD** (jeder implement-Worker baut test-first: red → green → refactor; via
  `build.implement.instructions` o.ä. an den Worker durchgereicht). Getestet via
  `anchored validate` + steps-Pläne.

## Setup-Skill
- Nach D1: Setup-Skill nutzt `anchored validate` als Abschluss-Check (statt nur
  `anchored steps`).

## Enforcement-Kontext (schon erledigt, B5)
- block-task-file-edits-Hook deckt jetzt auch Bash-Writes ab.
