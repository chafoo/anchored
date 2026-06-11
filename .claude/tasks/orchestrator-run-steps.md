# Ticket: Orchestrator führt eigene `run:`/`use:`-Steps aus (custom Build/Wrap-Steps)

**Status:** implementiert + verifiziert (alle ACs done; Workflow-Gegenprüfung folgt)
**Angelegt:** 2026-06-11
**Quelle:** VCS-Strategie-Wunsch (pro Task ein Branch, pro Phase ein Commit,
lokaler Merge auf `develop`) — beim Einbau in `anchored-test/anchored.yml`
aufgefallen.

## Problem

Die Substrat-Seite kann custom Steps längst: `merge(default, user)` mergt
`steps` keyed-by-name + extend-only, und `anchored steps <tier> <stage>` gibt
einen `{name, run}`-Step bereits als `{kind:'run', run:'…'}` im Plan zurück
(verifiziert). **Aber** der LIVE-Orchestrator ist im Plugin-Betrieb der
SKILL (nicht die in-process-Engine — ein headless Subprozess erreicht das
Task-Tool zum Agent-Spawnen nicht). Und `plugin/skills/build/SKILL.md` +
`wrap/SKILL.md` beschrieben bisher nur das Spawnen der benannten Worker
(implement/task-validate/code-validate, review/summarize) — die generische
Ausführung von `kind:'run'`/`kind:'use'`-Steps war **nie geschrieben**.

Folge: ein `commit`-Step in `phase.build.steps` stünde im Plan, würde vom
Orchestrator aber stillschweigend übersprungen. Reine `anchored.yml`-Config
reicht also nicht — der Orchestrator muss die Steps auch fahren.

**Kein Core-/Engine-/Factory-Code betroffen** — der Mangel liegt allein in der
Orchestrator-Prosa (zwei SKILL.md-Dateien).

## Akzeptanz-Kriterien

- **a1** — `build/SKILL.md` führt `kind:'run'`-Steps der Phase-Pipeline via Bash
  aus (in Deklarations-Reihenfolge; trailing nach den Gates, nur auf grüner
  Phase) und `kind:'use'`-Steps als Subagent/Skill. **done**
  → `plugin/skills/build/SKILL.md` Abschnitt „Custom run/use steps".
- **a2** — Variablen-Kontrakt dokumentiert + als echte Umgebungsvariablen an
  jeden `run:`-Step übergeben: `TASK_SLUG`, `PHASE_SLUG`, `PHASE_NAME`,
  `EPIC_SLUG` (kein hand-String-Replace). **done**
  → Tabelle + `TASK_SLUG='…' … bash -c "$STEP_RUN"`-Form im build-Skill.
- **a3** — `wrap/SKILL.md` führt trailing `kind:'run'`-Steps (z.B. `merge`) nach
  review+summarize aus, vor dem `done`-Flip; failter Step bleibt pre-`done`.
  **done** → wrap-Skill Abschnitt „Custom run/use steps".
- **a4** — Fan-out-Caveat dokumentiert: branch-per-task im parallelen
  Task-Fan-out (Epic, q8) braucht git-worktree-Isolation, sonst sequentiell.
  **done** → Hinweis im build-Skill.
- **a5** — Grep-Tests sichern die Skill-Prosa (run-step-Dispatch + Variablen-
  Kontrakt in beiden Skills). **done**
  → `workflow-smoke.spec.ts`: „orchestrator dispatches custom run/use steps".
- **a6** — Mechanik live bewiesen: in einem echten Test-Git-Repo erzeugt die
  VCS-`anchored.yml` über `anchored steps` + Ausführung des run-Strings
  tatsächlich Branch `task/<slug>` + zwei Phasen-Commits + `--no-ff`-Merge auf
  `develop` (Variablen-Kontrakt expandiert korrekt). **done**
- **a7** — Plugin-Version 0.1.3 → 0.1.4; alle 5 Gates grün (lint/format/
  typecheck/test/build). **done**

## Nicht-Ziele

- Keine VCS-Meinung im Framework-Default — das Default-Template bleibt
  VCS-agnostisch. Die VCS-Strategie lebt nur in `anchored-test/anchored.yml`
  (vom User via `/a:setup` aufgebaut).
- Keine Engine-/Core-Änderung — der steps-planner liefert run-Steps bereits.
