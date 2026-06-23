# Ticket: Jargon-Scrub — no framework vocabulary in the user chat (highest priority)

**Source:** recurring owner finding + 3-agent analysis of the v0.1.13 run.
"Nobody speaks the framework language" — DAG/JIT/Scaffold/Stub/Seam/Grounding/
roll-up/Outcome-AC/Executor/each-loop/drafted/refined/concern leak into the chat
and confuse the user.

## Problem
`communication-style.md:73–104` cleanly forbids the WRONG category (CLI verbs,
status flips, transition arrows, 1–2-letter ids) — but **framework process
jargon is not captured as a class**: no universal rule, no mapping
table. Worse: the 4 SKILLs **model the jargon themselves**, even in the
"Prefer (partner voice)" columns that are supposed to be the role model.

## Solution (two parts)
**(a) Centrally in `communication-style.md` (~:73–104):** one universal hard rule —
*"No framework process jargon. The names of internal processes (scaffold, stub, seam,
grounding, decompose, roll-up, outcome-AC, executor/fan-out, the each-loop, the
status words, concern) are MY vocabulary, not the user's. In the chat: the
plain text from the table below OR a clearer phrase on-the-fly — never the
framework term."* — immediately followed by the mapping table.

**(b) Scrub the role models** so they stop teaching the leak.

## Mapping table
| Framework term | Plain text for the user |
|---|---|
| DAG | the order / what has to be built first |
| JIT plan / JIT lifecycle | I plan the task only when it's up next |
| scaffold | sketch out the tasks roughly / set up the scaffold |
| stub | a rough task sketch / the still-empty task |
| seam | the spot in the code where this docks / the interface |
| grounding / ground | check against the real code state |
| roll-up | the closing check of the epic against its goal |
| outcome-AC | the outcome goal the task must satisfy in the end |
| executor / fan-out | build in parallel instead of one after another |
| each:task / each:phase loop | I go through the tasks/phases in order |
| drafted | plan is in place (draft) |
| refined | plan is checked / talked through |
| validate / gate | cross-check / the quality checks |
| concern | an open point for the close |
| Definition-of-Done | whether the epic reached its goal |
| TDZ, per-AC fan-out | never user-facing — audit only |

Internal field names (`depends_on`, `acceptance_criteria`, `build.each`) stay ONLY in the
CLI call / in docs, never in a chat line.

## Concrete scrub spots (file:line)
- **communication-style.md:~102** — Avoid→Prefer example: drop "Stubs + DAG" (also the Avoid side).
- **question-style.md:65–70** — broaden the guard: "… AND no framework process jargon; apply mapping."
- **plan/SKILL.md:** :19 Prefer "Task-Stubs" · :71 "discover then scaffold (stubs + dependency order)" · :89–92 "Stubs + DAG".
- **refine/SKILL.md:** :20 Prefer "plan is **refined**" (the role model teaches the leak!) · :34 "ground the stubs" · :52 "seams/DAG/grounding rollup" · :54–58 "outcome-AC/JIT plan" · :163 raw "refined".
- **build/SKILL.md:** :13–14 "each:task loop" · :19 Avoid "JIT-Lifecycle" (strictly the Avoid side) · :80–82 "JIT lifecycle/plan".
- **wrap/SKILL.md:** :32/:40 "roll-up / Definition-of-Done" (step name internal, chat line plain text) · concern walk: "concern" internal, in the chat "open point".
- **All 4 SKILLs** (comm-style block ~:11–21): one line each — "Apply the jargon mapping before every user-facing wording."

## Definition-of-Done
Universal rule + mapping table are in communication-style.md; NO listed
term survives anymore in a Prefer column or a chat-adjacent line; question-style
links the mapping; a grep test guards the rule + that the Prefer columns are clean.
