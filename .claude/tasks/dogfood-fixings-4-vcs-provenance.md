# Ticket: dogfood-fixings-4 — VCS-Provenance + Persistenz + CLI-Verben

**Quelle:** 3-Agent-Analyse des v0.1.13-Laufs (§3 Prozess-Reibung). App + Prozess
liefen sauber, keine Bugs — das hier ist Reibung an der Naht zwischen Lebenszyklus
und Git, nicht ein Defekt. Vier Punkte gehören zusammen (alle drehen sich um „wer
befüllt die VCS-Wahrheit und wo lebt sie"), Punkt 5 ist optional/niedrigste Prio.

## Problem (vier zusammenhängende Reibungspunkte)

**1. `commit_sha` zeigt auf den falschen Anker.** Das pro-Phase befüllte
`commit_sha`-Feld zeigt aktuell auf den Commit im **Phase-Branch**, der beim
task-Wrap-Merge (`--no-ff`) wieder **gelöscht** wird → der gespeicherte SHA ist nach
dem Merge tot/unauffindbar. Semantik klären: entweder auf den **Merge-Commit** auf
`develop` zeigen (überlebt) oder als „intermediate, im Audit ok"-Feld umbenennen
(`phase_commit` o.ä.) und zusätzlich ein task-level `merge_commit` führen.

**2. VCS-Provenance ist manuell statt engine-befüllt.** Die commit/branch/merge-
Schritte laufen heute als User-`run:`-Steps in der anchored.yml — der SHA landet nur
im Feld, wenn der Step ihn brav per `set-field` zurückschreibt. Das ist fehleranfällig
(F1 hat genau das schon mal getroffen). Überlegen: ein **engine-naher, optionaler
VCS-Provenance-Mechanismus**, der den Merge-/Commit-SHA deterministisch einfängt und
schreibt — Policy bleibt (commit-Strategie ist User-Config), aber das **Zurückschreiben
der Provenance** sollte nicht jedes Mal hand-verdrahtet sein. Grenze zur
[[fractal-substrate-integrity]] (Mechanismus vs. Policy) sauber ziehen: WAS committet
wird = Policy; DASS der resultierende SHA verlässlich ins Feld kommt = darf Mechanismus
sein.

**3. Task-File-State-Commit-Policy.** Der Evidence-Trail (das Task-File selbst, mit
allen ACs/evidence/log) wird im Lauf **nicht mitcommittet** — die Phase-Commits fassen
nur den Source an. Heißt: der wertvollste Audit-Artefakt (das `_task`/`_epic`-File) lebt
uncommitted im Working-Tree, bis irgendwer manuell committet. Policy festlegen: committen
wir das Task-File-State pro Phase mit (im selben Commit oder separat), und wenn ja —
als Default-Template-Step oder als Mechanismus?

**4. CLI-Verben `archive` / `reset`.** Nach jedem Dogfood musste das anchored-test-Repo
**manuell** zurückgesetzt werden (Branches gelöscht, Task-Files weg, develop/main
zurückgespult). Es fehlt ein sauberes CLI-Verb-Paar: `anchored archive <slug>` (Lauf
einfrieren/wegräumen) und `anchored reset <slug>` (Task-File + zugehörige Branches
in Ausgangszustand). Spart die fehleranfällige Handarbeit und macht Dogfood/CI
reproduzierbar.

## Beobachtung aus dem Transkript (eigener Befund)
Der Auto-Slug wurde im Lauf **erneut per rm + neu-anlegen umgangen** statt per
`--slug`. Der plan-SKILL sollte beim Re-Plan denselben Slug **explizit via `--slug`**
durchreichen, statt das File zu löschen und neu zu scaffolden (verliert sonst Historie/
Provenance). Kleiner Fix, gehört aber thematisch hierher (Provenance-Verlust).

## Optional / niedrigste Prio
**5. plan-decompose Enforcement-ACs up front.** Die Enforcement-Themen (trim/
whitespace, TDZ-freie Selektor-Scoping, etc.) könnten schon beim Zerlegen als
explizite ACs emittiert werden, statt erst im Build aufzutauchen. Nice-to-have,
nicht blockierend — separat halten, nicht mit 1–4 koppeln.

## Betroffen
- `core/` — `commit_sha`-Semantik / evtl. neues `merge_commit`-Feld; optionaler
  VCS-Provenance-Mechanismus (Mechanismus-Seite, hinter `run`-Seam); CLI-Verben
  `archive` + `reset` (cli/commands/).
- `anchored.default.yml` / example-yml — Task-File-State-Commit-Step (Policy-Seite).
- `plan/SKILL.md` — Re-Plan reicht `--slug` durch, kein rm+recreate.

## Akzeptanz
- a1: `commit_sha` (oder sein Nachfolger) zeigt nach dem task-Wrap auf einen
  **überlebenden** Commit; Semantik dokumentiert.
- a2: Die VCS-Provenance landet **verlässlich** im Feld, ohne dass jeder User-Step
  das Zurückschreiben selbst korrekt verdrahten muss; Mechanismus-vs-Policy-Grenze
  dokumentiert.
- a3: Task-File-State-Commit-Policy ist entschieden + verdrahtet (Default-Template
  oder Mechanismus), der Audit-Trail ist nach einem Lauf committet.
- a4: `anchored archive <slug>` + `anchored reset <slug>` existieren, getestet, machen
  die manuelle Repo-Rücksetzung überflüssig.
- a5: Re-Plan nutzt `--slug` statt rm+recreate (kein Provenance-Verlust).
- a6 (optional): plan-decompose kann Enforcement-ACs up front emittieren.
