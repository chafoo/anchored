# Ticket: Harden-3 — Trust → Enforcement: Gate-Agent + erfasster exit-code + Context-Fäden (L)

**STATUS: ERLEDIGT ✅** (254 Tests grün) — L1a `add-phase-evidence --run` (exit-code
durch Code, nur exit-0 → Evidenz, sonst lautes GateFailed), L1b build-gate-Agent +
build-implement-Guidance, L2 per Komposition (M2 blockt Phase-done ohne grüne
--run-AC), Concern-Fläche HART im Substrat: `add-concern`/`resolve-concern`,
`setStatus→done` lehnt mit `ConcernsOpen` ab solange offen; Wrap-Concern-Walk (gleicher
Walk-Style wie Refine: nur wichtige / alle / alles-AI) löst sie auf. „Nichts bleibt
offen, aber Concerns können geklärt werden" — live + Test bewiesen.


**Quelle:** Härtungs-Review + Design-Gespräch. Verschlankt gegenüber der ersten
Fassung: statt zwei Schwergewichten (gate-Verb + strukturiertes Evidenz-System) →
**EIN** Gate/Verify-Agent + **ein** kleines erfassendes CLI-Verb. „Lieber etwas als
zu wenig", aber mit echtem deterministischen Boden.

## Designentscheidung (festgehalten)
**Der exit-code geht durch Code, nicht durch den Agenten.** Ein Agent, der selbst
„exit 0" behauptet, wäre nur der Validator umbenannt. Stattdessen fährt der Agent
seine Runs durch eine **erfassende CLI**, die das Kommando real ausführt, `code` +
`stdout` erfasst (`run-step.ts` kann das schon) und nur bei **exit-0** Evidenz
akzeptiert. **Regel: nur bei exit 0 → AC done. Bei Fehler → in Context notieren +
entscheiden wie weiter (nie still, nie auto-done).**

## L1 + L3 (verschmolzen) — Gate/Verify-Agent + erfassendes Verb

### L1a — erfassendes Evidenz-Verb (deterministischer Boden, S–M)
`anchored node add-phase-evidence <slug> <phase> <ac> --run "<cmd>"`: führt `<cmd>`
über die run-Naht aus, schreibt strukturierte Evidenz `{command, exit_code, output}`,
**akzeptiert die AC nur bei exit-0**. Prosa-Evidenz bleibt weiter erlaubt (für nicht
command-verifizierbare Fälle: Browser-Verhalten, Design), aber im Datenmodell
unterscheidbar (reproduzierbar vs. behauptet). Der exit-code wird von Code erfasst,
nicht vom Agenten behauptet.

### L1b — Gate/Verify-Agent (das Flexible, AI)
Ein Agent, der:
- **Instruktionen + Command(s)** bekommt (config-getrieben, wie ein custom step;
  hier landen die Projekt-Gate-Commands test/lint/typecheck),
- die Runs **durch das erfassende Verb (L1a)** fährt → deterministischer exit-0-Boden,
- **Evidence + Probleme interpretiert** (das qualitative Urteil bleibt sinnvoll AI),
- alles in den **Context** schreibt — Ergebnis-Summary + jeden unerwarteten Punkt als
  offenen Faden (siehe Context-Sektion).

**Bei Fehler (exit ≠ 0):** der Agent notiert den Fehler im Context (offener Faden),
die AC bleibt NICHT done; Mensch/AI entscheidet, wie weiter (fix, defer, akzeptieren
mit Begründung). Nie still durchwinken.

## L2 — Phase-done an grünen Record gekoppelt (M)
`setChildStatus(phase, done)` verlangt: (a) alle ACs done-mit-Evidenz UND (b) wo ein
Gate-Command definiert ist, ein **grüner erfasster Record** (exit-0). Sonst
`GateNotRun`/`GateFailed`. Baut auf L1a + Harden-2/M2 (AC-Completion) auf. Danach
kann der Orchestrator die Phase nicht mehr vor grünen Gates done setzen.

## Context-„offene Fäden" — die v1-`task.context`-Stärke zurückholen (S–M)
In v1 hielt `task.context` alles fest + hatte eine „muss noch besprochen werden"-
Sektion. v2 fehlt das als bewusste Oberfläche. Einbauen:
- Eine laufende **„offene Fäden / am Ende prüfen"-Liste**: Gate-Agent + jeder Worker
  hängt unerwartete Punkte an — `anchored node append-log <slug> <stage> concern
  "<was am Ende geprüft werden muss>"` (`log[]` + `kind` existiert; wir brauchen die
  Konvention `kind: concern` + einen View darüber).
- **Wrap/roll-up prüft die offenen Fäden** und hakt den Abschluss, solange welche
  offen/unadressiert sind. Deterministische Hälfte: nicht „die AI erinnert sich",
  sondern „das Substrat zeigt die offenen Punkte, done blockiert bis adressiert".
- Fängt genau die unerwarteten Gate-/Run-Fehler strukturiert ab, statt im Prosa-
  Trail unterzugehen.

## Reihenfolge / Abhängigkeit
Harden-1 → Harden-2 → Harden-3. L2 braucht L1a + Harden-2/M2. Der Context-Faden-
Mechanismus kann früh kommen (billig) und wird von L1b genutzt.
