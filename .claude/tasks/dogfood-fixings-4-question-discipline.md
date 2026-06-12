# Ticket: dogfood-fixings-4 — Frage-Disziplin universal (Generosität zurückholen)

**Quelle:** Gespräch nach der Härtung. Beobachtung aus allen v2-Dogfood-Läufen:
ständig „0 offene Fragen". Nach dem v1-Maßstab (*under-surface ist der Failure-
Mode*) ist das ein Warnzeichen — v2 surfaced zu wenig.

## Problem
v1 (`~/Dev/anchored/plugin/agents/plan.md`) hatte ein reiches Frage-Tuning:
Generosität-Direktive, der „ich pick einfach X = das IST die Frage"-Reflex, eine
Taxonomie von WANN, der Klammer-Empfehlungs-Trick, Prioritäts-Kalibrierung. Beim
Verschlanken der v2-decompose-Agenten ging das **teilweise verloren** — die
*Struktur* (Split plan/refine, Walk-Style, `question-style.md`) blieb, das
*Generositäts-Tuning* nicht.

## Lösung: ein universelles Prinzip, pro Etage nur die Linse
Das v1-Tuning ist nicht task-spezifisch — die Mechanik ist universal, nur „was als
Ambiguität zählt" unterscheidet sich. Also DRY:

- **Universelle Referenz `plugin/references/question-discipline.md`** (aus v1
  generalisiert): „over-surface ok, under-surface = Failure-Mode" · „ich pick
  einfach X = die Frage" · Klammer-Empfehlung (`… ? (lean X — weil Y)`) ·
  Prioritäts-Test („wäre der User sauer, wenn das ohne ihn entschieden wurde?" =
  high; prägt-das-Gefühl-aber-tauschbar = medium; in-5-Min-reversibel = low).
  Grenzt sich von `question-style.md` ab: *discipline* = WANN/wie generös,
  *style* = WIE formuliert (Empfehlung + Implikationen).
- **Pro Etage 2–3 Zeilen „was hier eine Frage ist":**
  - *Task/Phase:* Feature-/UX-Entscheidungen — Verhalten, Style, Sortierung,
    Error-UX, Empty-State, A11y.
  - *Epic:* Scope-/Zerlegungs-Entscheidungen — wie wird gesplittet, was ist
    drin/draußen, wo verlaufen die Task-Grenzen, der Integrations-Vertrag, die
    DAG-Kanten.

## Betroffen
- NEU: `plugin/references/question-discipline.md`.
- Linken + tier-Linse ergänzen: plan-decompose, epic-decompose, refine-plan-check,
  refine-rules-check, epic-plan-check.

## Akzeptanz
- a1: universelle Referenz existiert (die v1-Direktiven, generalisiert).
- a2: jeder Frage-autorende Agent linkt sie + trägt seine tier-spezifische Linse.
- a3: Epic bekommt die Zerlegungs-Linse (Scope/Split/Integration/DAG).
- a4: Grep-Test sichert die Verdrahtung; ein Dogfood/Trockenlauf surfaced wieder
  Fragen statt „0".
