# Agent contract — the spawn-input contract (skill ⇄ agent)

> The single seam between the **skill** (the conductor, in-session) and an **agent**
> (an effect, spawned via the Task tool). Both sides reference this document so they
> never guess past each other. CLI-only transport: the agent reads and writes
> exclusively through the `anchored` CLI, never through raw Write/Edit on task-files
> (only build-implement mutates source-code files, via Write/Edit/Bash).

## The CLI grammar is TIER-FIRST

Every call is `anchored <tier> <verb> [slug] [args]` — the tier (`phase` · `task` ·
`epic` · `project`) is always the first token, the verb second. There is no `anchored
node …` surface any more. The CLI emits one JSON envelope per call:
`{ ok, command, result | error }`.

Meta-verbs (no tier): `anchored validate` · `anchored help` · `anchored version`.

## What the skill hands each agent (input)

On spawn (Task tool), the skill passes at least the following in the prompt:

| Field | Meaning |
|---|---|
| `task-slug` | the **task** slug (the task-file). ALWAYS the task, never the phase slug. |
| `phase-slug` | (build/leaf only) the target **phase** inside the task-file. |
| `tier` | `phase` \| `task` \| `epic` \| `project` — which level is being worked on. |
| `stage` | `plan` \| `refine` \| `build` \| `wrap` — which stage. |
| `context` | prose context: the phase/node `context`, the `plan` trail, resolved questions. |
| `rules` | the `rules[]` of the phase/task (`{ path, why }`) — the agent reads them and adheres to them. |
| `instructions` | optional step `instructions` from the (merged) template — passed through verbatim. |

The skill determines the worker identity (which agent) from the **stage verb's plan**:
`anchored <tier> <stage> <slug>` returns `{ steps: [{ name, use: { type, name }, involve, … }],
each?, stop?, retry_limit?, node }` — the `use: { type, name }` is **inline data** on each
step (the plugin agent/skill to spawn). There is no separate `anchored steps` command.

## Phase addressing (critical)

A **phase is a child inside the task-file** — it has NO node-file of its own. So a
phase is addressed by **one slash-joined slug** `<task-slug>/<phase-slug>` on the
`phase` tier, never as two args:

- Evidence per phase acceptance criterion → `anchored phase ac-evidence <task-slug>/<phase-slug> <ac-id> "<proof>"`
  — **anchor the evidence on the symbol, NO raw line numbers (H6, tightened):**
  lead with the function/symbol/file (`saveTasks() in app.js`) plus a short code
  snippet where the proof lives. Do **not** append "(line NN)" — a line number goes
  stale *within the same task* the moment a later phase inserts code above it. Symbol
  + snippet is stable; the line number is only stale-going noise.
- Set phase status → `anchored phase status <task-slug>/<phase-slug> <status>`
- (a nested task is `<epic>/<task>`, so its phase is `<epic>/<task>/<phase>` — still
  one slash-joined slug; the last segment is always the phase.)

A **node-level** verb (task/epic/project — e.g. wrap-summarize, epic-roll-up) instead
addresses the node by its own `<slug>` (`anchored task set <slug> …`, `anchored epic
status <slug> …`) — that is its own file.

## The verb map (the only surface — old `node …` is gone)

| do this | command |
|---|---|
| read a node | `anchored <tier> get <slug>` |
| create a node | `anchored <tier> create <slug> "<title>"` |
| get the stage plan (steps + node) | `anchored <tier> plan\|refine\|build\|wrap <slug>` |
| set a field (dotted ok: `context.wrap`) | `anchored <tier> set <slug> <field> "<value>"` |
| advance status | `anchored <tier> status <slug> <to>` |
| append an audit-log entry | `anchored <tier> append-log <slug> <at> <kind> "<note>"` |
| raise / resolve a question | `anchored <tier> question-add <slug> "<text>" [priority]` · `anchored <tier> question-resolve <slug> <id> "<answer>" [user\|ai] ["<reasoning>"]` |
| raise / resolve a concern | `anchored <tier> concern-add <slug> "<text>" [priority]` · `anchored <tier> concern-resolve <slug> <id> "<answer>" [user\|ai] ["<reasoning>"]` |
| — TASK owns phase EXISTENCE — | |
| add a phase | `anchored task add-phase <task-slug> <phase-slug> "<name>"` |
| list / next / ready phases | `anchored task list-phases\|next-phase\|ready-phases <task-slug>` |
| — PHASE owns its CONTENT — | |
| add an acceptance criterion | `anchored phase ac-add <task>/<phase> "<text>"` (id auto a1, a2, …) |
| evidence an AC (flips it done) | `anchored phase ac-evidence <task>/<phase> <ac-id> "<proof>"` |
| reject an AC (back to pending) | `anchored phase ac-fail <task>/<phase> <ac-id> "<why>"` |
| defer an AC (out of scope here) | `anchored phase ac-defer <task>/<phase> <ac-id> "<reason>"` |
| attach a rule to a phase | `anchored phase rule-add <task>/<phase> <path> "<why>"` |
| set how a phase builds | `anchored phase set-execute <task>/<phase> <sequential\|workflow>` |
| set a phase's dependencies | `anchored phase set-depends <task>/<phase> "<phase-slugs>"` |
| — EPIC/PROJECT own STUB existence — | |
| add a child-stub | `anchored epic child-add <epic-slug> <task-stub-slug> ["<goal>"]` (project: `anchored project child-add <project> <epic-stub>`) |
| advance a child-stub | `anchored epic child-status <epic-slug> <stub-slug> <pending\|active\|done\|blocked>` |
| set a stub field (e.g. depends_on) | `anchored epic child-set-field <epic> <stub> depends_on "a,b"` |
| add a stub outcome-AC | `anchored epic child-ac-add <epic> <stub> "<text>"` (project: `anchored project child-ac-add <project> <stub> "<text>"`) |
| evidence a stub outcome-AC (flips it done) | `anchored epic child-ac-evidence <epic> <stub> <ac-id> "<proof>"` (project: `anchored project child-ac-evidence …`) |
| reject a stub outcome-AC (back to pending) | `anchored epic child-ac-fail <epic> <stub> <ac-id> "<why>"` (project: `anchored project child-ac-fail …`) |
| defer a stub outcome-AC (out of scope) | `anchored epic child-ac-defer <epic> <stub> <ac-id> "<reason>"` (project: `anchored project child-ac-defer …`) |
| add / flip an epic DoD item | `anchored epic add-acceptance <epic> "<text>"` · `anchored epic set-acceptance-status <epic> <id> done "<delivery evidence>"` |
| roll up (reads child files) | `anchored epic roll-up <epic-slug>` |

> No `question-list` verb — read the node (`anchored <tier> get <slug>`) and filter
> `questions[]` / `concerns[]` in-session.
>
> **`set-child-status` split by tier:** a *phase* (task's child) → `anchored phase
> status <task>/<phase> …`; a *task-stub* (epic's child) → `anchored epic child-status
> <epic> <stub> …`; an *epic-stub* (project's child) → `anchored project child-status …`.

## What the agent writes back out (output = self-write via CLI)

No structured return that the skill applies — the agent **self-writes** its result
directly via the CLI. Per agent role:

| Role | self-write commands |
|---|---|
| plan-discover / plan-rules-scan / refine-* / wrap-review / validators | `anchored <tier> append-log <task-slug> <stage> <kind> "<note>"` |
| plan-decompose | `anchored task add-phase <task-slug> <phase-slug> "<name>"` · `anchored phase ac-add <task-slug>/<phase-slug> "<text>"` · MAY record how a phase builds (`anchored phase set-execute <task-slug>/<phase-slug> <sequential\|workflow>`) and its cross-phase deps (`anchored phase set-depends <task-slug>/<phase-slug> "<phase-slugs>"`) |
| epic-scaffold | `anchored epic child-add <epic-slug> <task-stub-slug> "<goal>"` |
| build-implement | code (Write/Edit) + a build-NOTE per criterion: `anchored task append-log <task-slug> build note "<ac-id>: <symbol> — <what + gate green>"`. Authors **NO** evidence, flips nothing — the checker records the proof (requirements-3). |
| build-task-validate | the **EVIDENCE AUTHOR**: independently re-verifies each criterion, then `anchored phase ac-evidence <task-slug>/<phase-slug> <ac-id> "<proof>"` on pass (flips it done; symbol anchor) or `anchored phase ac-fail <task-slug>/<phase-slug> <ac-id> "<why>"` on fail (→ pending, re-do loop). NEVER flips the phase status (G4). |
| build-code-validate | rule inspector (no evidence): `anchored phase ac-fail <task-slug>/<phase-slug> <ac-id> "<rule violation>"` on a violation (→ pending, re-do — may veto a criterion the checker already evidenced) + rollup via `append-log … build learning` |
| build-workflow | fan-out unit-worker: code + a build-NOTE via `append-log … build note` (authors **NO** evidence, like build-implement; the checker records it post-fan-out) |
| wrap-summarize | `anchored <tier> set <node-slug> context.wrap "<summary>"` (dotted-path → nested) |
| epic-roll-up | `anchored epic roll-up <epic-slug>` (read child statuses) · `anchored epic set-acceptance-status <epic> <id> done "<evidence>"` · `anchored epic append-log <epic-slug> wrap <kind> "<retro>"` · `anchored epic status <epic-slug> done` |

Each agent doc names, at its head, the fields it expects plus the commands it runs —
this contract is the shared reference. When an agent needs a field that is not listed
here, that is a contract update (here), not a silent guess.
