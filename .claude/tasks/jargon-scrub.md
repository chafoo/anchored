# Ticket: Jargon-Scrub — kein Framework-Vokabular im User-Chat (höchste Prio)

**Quelle:** wiederkehrender Owner-Befund + 3-Agent-Analyse des v0.1.13-Laufs.
„Niemand spricht die Framework-Sprache" — DAG/JIT/Scaffold/Stub/Seam/Grounding/
roll-up/Outcome-AC/Executor/each-Loop/drafted/refined/concern leaken in den Chat
und verwirren den User.

## Problem
`communication-style.md:73–104` verbietet die FALSCHE Kategorie sauber (CLI-Verben,
Status-Flips, Transition-Pfeile, 1–2-Buchstaben-Ids) — aber **Framework-Prozess-
Jargon ist nicht als Klasse erfasst**: keine universelle Regel, keine Mapping-
Tabelle. Schlimmer: die 4 SKILLs **modellieren den Jargon selbst**, sogar in den
„Prefer (partner voice)"-Spalten, die das Vorbild sein sollten.

## Lösung (zwei Teile)
**(a) Zentral in `communication-style.md` (~:73–104):** eine universelle Hard-Rule —
*„Kein Framework-Prozess-Jargon. Die Namen interner Prozesse (scaffold, stub, seam,
grounding, decompose, roll-up, outcome-AC, executor/fan-out, der each-Loop, die
Status-Wörter, concern) sind MEIN Vokabular, nicht das des Users. Im Chat: der
Klartext aus der Tabelle unten ODER eine klarere Phrase on-the-fly — nie der
Framework-Begriff."* — direkt gefolgt von der Mapping-Tabelle.

**(b) Die Vorbilder scrubben**, damit sie den Leak nicht weiter lehren.

## Mapping-Tabelle
| Framework-Begriff | Klartext für den User |
|---|---|
| DAG | die Reihenfolge / was zuerst gebaut werden muss |
| JIT-Plan / JIT-Lifecycle | ich plane den Task erst, wenn er dran ist |
| scaffold | die Tasks grob skizzieren / das Gerüst anlegen |
| stub | eine grobe Task-Skizze / die noch-leere Task |
| seam | die Stelle im Code, an der das andockt / die Schnittstelle |
| grounding / ground | gegen den echten Code-Stand prüfen |
| roll-up | die Abschluss-Prüfung des Epics gegen sein Ziel |
| outcome-AC | das Ergebnis-Ziel, das der Task am Ende erfüllen muss |
| executor / fan-out | parallel statt nacheinander bauen |
| each:task / each:phase-Loop | ich gehe die Tasks/Phasen der Reihe nach durch |
| drafted | Plan steht (Entwurf) |
| refined | Plan ist geprüft / durchgesprochen |
| validate / gate | gegenchecken / die Qualitäts-Checks |
| concern | ein offener Punkt für den Schluss |
| Definition-of-Done | ob das Epic sein Ziel erreicht hat |
| TDZ, per-AC fan-out | nie user-facing — nur Audit |

Interne Feldnamen (`depends_on`, `acceptance_criteria`, `build.each`) bleiben NUR im
CLI-Call/in Docs, nie in einer Chat-Zeile.

## Konkrete Scrub-Stellen (file:line)
- **communication-style.md:~102** — Avoid→Prefer-Beispiel: „Stubs + DAG" raus (auch Avoid-Seite).
- **question-style.md:65–70** — Schranke erweitern: „… UND kein Framework-Prozess-Jargon; Mapping anwenden."
- **plan/SKILL.md:** :19 Prefer „Task-Stubs" · :71 „discover dann scaffold (Stubs + Abhängigkeits-Reihenfolge)" · :89–92 „Stubs + DAG".
- **refine/SKILL.md:** :20 Prefer „Plan ist **refined**" (Vorbild lehrt den Leak!) · :34 „ground the stubs" · :52 „seams/DAG/grounding rollup" · :54–58 „outcome-AC/JIT plan" · :163 rohes „refined".
- **build/SKILL.md:** :13–14 „each:task loop" · :19 Avoid „JIT-Lifecycle" (strikt Avoid-Seite) · :80–82 „JIT lifecycle/plan".
- **wrap/SKILL.md:** :32/:40 „roll-up / Definition-of-Done" (Step-Name intern, Chat-Zeile Klartext) · Concern-Walk: „concern" intern, im Chat „offener Punkt".
- **Alle 4 SKILLs** (Comm-style-Block ~:11–21): je eine Zeile — „Vor jeder user-facing Formulierung das Jargon-Mapping anwenden."

## Definition-of-Done
Universelle Regel + Mapping-Tabelle stehen in communication-style.md; KEIN gelisteter
Begriff überlebt mehr in einer Prefer-Spalte oder Chat-nahen Zeile; question-style
verlinkt das Mapping; Grep-Test sichert die Regel + dass die Prefer-Spalten sauber sind.
