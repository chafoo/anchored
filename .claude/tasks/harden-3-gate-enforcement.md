# Ticket: Harden-3 — Trust → Enforcement: echte Gates + Evidenz-Boden (L-Tier)

**Quelle:** Härtungs-Review. Die strategisch wichtigste, aber tiefste Gruppe:
verschiebt „Gates liefen wirklich", „Phase done erst nach Gates" und „Evidenz ist
echt" von SKILL-Prosa/AI-Trust in deterministischen Code. Ändert den Build-Flow +
den Agent-Contract. M→L.

## Findings + Fix

### L1 — Build-Gates sind AI-Richter ohne deterministischen Backstop
Nichts im Substrat verlangt, dass lint/typecheck/test tatsächlich liefen und 0
zurückgaben, bevor ein AC akzeptiert wird (`build-task-validate.md`,
`build-code-validate.md`; die `run`-Naht in `run-step.ts` erfasst code+stdout
bereits, wird aber dafür nicht genutzt). Halluzinieren die Gates „pass", shippt eine
kaputte Phase.
**Fix:** `anchored gate <slug> <phase>`-Verb, das die konfigurierten Gate-Commands
über die run-Naht fährt, exit-codes erfasst und einen pass/fail-Record auf die Phase
schreibt. Das AI-code-validate bleibt als Defence-in-Depth fürs *qualitative*
Regel-Urteil; das *binäre* „exited 0" wird Code.

### L2 — Phase-done-Flip nicht an grünen Gate-Record gekoppelt (nur G4-Prosa)
`setChildStatus(node, phase, 'done')` (`node-ops.ts:451`) hat keine Vorbedingung,
dass die Gates liefen — nur die SKILL-Prosa hält den Orchestrator zurück. Ein
driftender Orchestrator flippt die Phase done, bevor die Gates laufen.
**Fix:** Phase-done an den grünen Gate-Record (L1) koppeln: `setChildStatus→done`
für eine Phase verlangt (a) alle ACs done-mit-Evidenz UND (b) grüner Gate-Record,
sonst `GateNotRun`. (Baut auf Harden-2/M1+M2 auf.)

### L3 — Evidenz-Honesty ohne reproduzierbaren Artefakt-Boden
`isEvidenceFilled` (`invariants.ts:24`) akzeptiert jeden nicht-leeren String, also
flippt `add-phase-evidence … 'verified, all good'` das AC auf done; einziger
Inspektor ist ein foolbarer AI-Agent.
**Fix:** strukturierte Evidenz-Variante `{command, exit_code, output}` einführen,
die `anchored node add-phase-evidence --verified-run "<cmd>"` über die run-Naht
ausführt und nur bei exit-0 akzeptiert. Prosa-Evidenz bleibt erlaubt, aber im
Datenmodell unterscheidbar (reproduzierbar vs. behauptet).

## Implikationen (Chat)
- Ändert den Build-Loop: der Orchestrator/CLI fährt die Gates wirklich; Agent-
  Contract der Validatoren wird angepasst (binär→Code, qualitativ→AI).
- Braucht eine Stelle in der Config, wo die Gate-Commands deklariert werden
  (test/lint/typecheck) — passt zum custom-step-Modell, aber ist neue Oberfläche.
- Abhängig von Harden-2 (Completion-Checks), auf die L2 aufsetzt.

## Reihenfolge
Harden-1 → Harden-2 → Harden-3 (jede Stufe baut auf der vorigen; Gate-Enforcement
erst, wenn Completion deterministisch ist).
