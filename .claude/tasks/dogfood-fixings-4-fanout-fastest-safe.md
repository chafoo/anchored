# Ticket: dogfood-fixings-4 — Fan-out: schnellster *sicherer* Weg als Default

**Quelle:** Gespräch nach der Härtung. Beobachtung: die executor-Entscheidung ist
konservativ-default-sequentiell → der Fan-out feuert praktisch nie (beide Dogfoods
liefen komplett sequentiell, obwohl der Mechanismus da ist).

## Leitprinzip (vom User)
**Tempo ist Default, wo es sicher ist. Die Schranke schützt NUR Korrektheit, nie
Qualität.** Der einzige echte Qualitäts-/Verhaltensunterschied zwischen parallel
und sequentiell ist: sequentiell landen die Phasen nacheinander (der User kann
halbwegs zuschauen), parallel zusammen. Sonst nichts.

## Lösung: Default umdrehen + User-Präferenz im Refine
Heute: konservativ → sequentiell, außer offensichtlich unabhängig.
Neu: **schnellster sicherer Weg → parallel; sequentiell nur als bewusste Wahl oder
wenn unsicher.**

- **Sicherheits-Floor (hart, nie verhandelbar — Korrektheit):** parallel nur wenn
  die ACs wirklich unabhängig sind (keine fasst die andere an, keine zwei dieselbe
  Datei-Region). Sonst racen sie → Korruption. Klar als Korrektheit framen, NICHT
  als Tempo-vs-Qualität.
- **Innerhalb von „sicher" → Default = `workflow`** (schnellster Weg), nicht mehr
  konservativ-sequentiell.
- **User-Präferenz, einmal im Refine gefragt** (wie der Walk-Style, ephemer):
  *„Wo's sicher ist — so schnell wie möglich (parallel) oder lieber sequentiell,
  damit du mitschauen kannst? Rein Tempo vs. Zuschauen — die Qualität ist
  identisch."* Default: so schnell wie sicher.
- **Sicher auch bei Fehleinschätzung:** jeden Fan-out-Worker in
  **git-Worktree-Isolation** fahren — dann korrumpiert ein falsches Unabhängigkeits-
  Urteil nichts (die Stände mergen nur), und der CAS/Lock (Harden-2/M4) fängt den
  Rest. So bleibt „schnellster Weg" robust gegen das AI-Judgment.

## Betroffen
- `refine/SKILL.md` „Decide the per-phase executor": Default umdrehen + die
  Tempo-vs-Zuschauen-Präferenz (einmalig, ephemer, explizit „nie eine Qualitäts-
  entscheidung").
- `build/SKILL.md`: Fan-out-Worker unter Worktree-Isolation (Phase- UND Task-Level);
  der Worktree-Caveat wird vom Caveat zur Vorgabe.
- ggf. `communication-style.md`: das „Tempo vs. Zuschauen, Qualität identisch"-Framing.

## Akzeptanz
- a1: Refine wählt `workflow`, sobald der Sicherheits-Floor (unabhängige ACs)
  passt — Default ist Tempo, nicht Konservativität.
- a2: Refine fragt einmal die Tempo-vs-Zuschauen-Präferenz; Prosa stellt klar, dass
  das NIE eine Qualitätsentscheidung ist (nur Zuschaubarkeit).
- a3: Fan-out-Worker laufen unter git-Worktree-Isolation (dokumentiert + im
  build-SKILL als Vorgabe, nicht Option).
- a4: Grep-Test sichert die Verdrahtung; der Sicherheits-Floor bleibt als
  Korrektheits-Schranke erhalten.
