# Agent contract — the spawn-input contract (skill ⇄ agent)

> The single seam between the **skill** (the conductor, in-session) and an **agent**
> (an effect, spawned via the Task tool). Both sides reference this document so they
> never guess past each other. CLI-only transport: the agent reads and writes
> exclusively through the `anchored` CLI, never through raw Write/Edit on task-files
> (only build-implement mutates source-code files, via Write/Edit/Bash).

## What the skill hands each agent (input)

On spawn (Task tool), the skill passes at least the following in the prompt:

| Field | Meaning |
|---|---|
| `task-slug` | the **task** slug (the task-file). ALWAYS the task, never the phase slug. |
| `phase-slug` | (build/leaf only) the target **phase** inside the task-file. |
| `tier` | `phase` \| `task` \| `epic` — which level is being worked on. |
| `stage` | `plan` \| `refine` \| `build` \| `wrap` — which stage. |
| `context` | prose context: the phase/node `context`, the `plan` trail, resolved questions. |
| `rules` | the `rules[]` of the phase/task (`{ path, why }`) — the agent reads them and adheres to them. |
| `instructions` | optional step `instructions` from the (merged) config — passed through verbatim. |

The skill determines the worker identity (which agent) **not** by hardcoding it, but
from `anchored steps <tier> <stage>` (→ the `agent` reference per worker step).

## Phase addressing (critical)

A **phase is a child inside the task-file** — it has NO node-file of its own. So a
phase-level agent addresses its writes via **`<task-slug> <phase-slug>`**, never as a
standalone node:

- Evidence per phase acceptance criterion → `anchored node add-phase-evidence <task-slug> <phase-slug> <ac-id> "<proof>"`
  — **anchor the evidence on the symbol, NO raw line numbers (H6, tightened):**
  lead with the function/symbol/file (`saveTasks() in app.js`) plus a short code
  snippet where the proof lives. Do **not** append "(line NN)" — a line number goes
  stale *within the same task* the moment a later phase inserts code above it (in the
  dogfood, evidence drifted ~40 lines onto unrelated code). Symbol + snippet is
  stable; the line number is only stale-going noise.
- Set phase status → `anchored node set-child-status <task-slug> <phase-slug> <status>`

A **node-level** agent (task/epic, e.g. wrap-summarize, epic-roll-up) instead
addresses the node by its own `<slug>` (`set-field <slug> …`, `set-status <slug> …`) —
that is its own file.

## What the agent writes back out (output = self-write via CLI)

No structured return that the skill applies — the agent **self-writes** its result
directly via the CLI. Per agent role:

| Role | self-write commands |
|---|---|
| plan-discover / plan-rules-scan / refine-* / wrap-review / validators | `anchored node append-log <task-slug> <stage> <kind> "<note>"` |
| plan-decompose | `anchored node add-phase <task-slug> <phase-slug> "<name>"` · `anchored node add-ac <task-slug> <phase-slug> "<text>"` (id auto a1, a2, …) |
| epic-scaffold | `anchored node add-child <epic-slug> <task-stub-slug>` |
| build-implement | `anchored node add-phase-evidence <task-slug> <phase-slug> <ac-id> "<proof>"` (evidence-only — symbol anchor; NEVER flips the phase status itself, G4) |
| build-task-validate / build-code-validate | pure inspector (no code write); REJECT an acceptance criterion via `anchored node set-failures <task-slug> <phase-slug> <ac-id> "<why>"` (flips it pending → re-do loop) + rollup via `append-log … build learning` |
| wrap-summarize | `anchored node set-field <node-slug> context.wrap "<summary>"` (dotted-path → nested) |
| epic-roll-up | `anchored node append-log <epic-slug> wrap <kind> "<definition-of-done / retro>"` · `anchored node set-status <epic-slug> done` |

Each agent doc names, at its head, the fields it expects plus the commands it runs —
this contract is the shared reference. When an agent needs a field that is not listed
here, that is a contract update (here), not a silent guess.
