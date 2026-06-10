# Fraktal-Redesign — Agenda (eins nach dem anderen)

> Offene Fragen + Ideen, die wir der Reihe nach durchgehen, BEVOR wir Architektur
> anfassen. Ziel dieser Phase: verstehen + entscheiden, noch nicht bauen.
> Begleit-Doks: `fractal-redesign-notes.md` (Entscheidungs-Record),
> `docs/drafts/fractal-lifecycle.md`, `docs/drafts/anchored.default.yml`.

## Scope-Leitplanke (vom User gesetzt)

- **Jetzt**: das ganze Ding sauber umbauen + testen. **Später**: eigene Agenten
  selbst bauen (custom agent SDK o.ä.) — für jetzt zu viel, geparkt.

## Durchzugehen

### 1. Plan-Entry-Signatur + Epic/Task-Klassifikation ✅ ENTSCHIEDEN
- Details siehe `fractal-redesign-notes.md` → „Plan-Entry + Epic/Task-Klassifikation".
- Kurz: `/impl-plan <epic|task>?` ; ohne Tier → discover → classify → confirm.
  discover an beiden Tiers. Erkennung: <5 task / 5–9 Unabhängigkeits-Test / ≥10 epic.
  Eskalation fraktal billig; Auto = v2.

### 2. Ausführungs-Substrat des Loops ✅ ENTSCHIEDEN
- Headless `claude -p` pro Task-File, Phasen in-process; `spawn` als Naht offen.
  Record in den Notes.

### 3. Architektur-Prinzip: fraktale Factory-Functions ✅ ENTSCHIEDEN
- Detail + Diagramme: `docs/drafts/engine-architecture.md`; Record in den Notes.

### 4. Agent-Organisation in Buckets ✅ ENTSCHIEDEN
- Keine Unterordner (CC scannt nur flach) → Präfix-Buckets. Roster = distinkte
  Worker; geteilte tier-parametrisiert. Record in den Notes.

### 5. Carry-over (aus den Notes)
- 5a. steps/each-Semantik ✅ ENTSCHIEDEN — `each` am Step; loop-Step hat
  interleaved Body. Record in den Notes.
- 5b. Ops-Namespace ✅ ENTSCHIEDEN — tier-generischer Kern + per-Tier-CLI;
  Tier-Schema = Code-Mechanik + Config-Felder; anchored.yml = Base-Dep
  (merge default+user, beim Bootstrap geladen). Record in den Notes.

## Alle Items durch ✅ — nächster Schritt: „Plan forward" (impl-epic-layer neu aufsetzen)

## Vorgeschlagene Reihenfolge

1 → 4 (UX/Verhalten klären) … dann 2 + 3 (Ausführung + Architektur, hängen
zusammen) … dann 5 (Detail-Semantik). Reihenfolge anpassbar.
