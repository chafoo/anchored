# anchored CLI — API reference

The single transport for every operation. All ops run through the `anchored` CLI,
invoked via Bash — no MCP. The CLI emits one envelope per call; works the same in
the main session and in subagents/headless.

```
anchored <tier> <verb> [slug] [args]
```

One grammar, tier-first: the tier (`phase` · `task` · `epic`) is always the first
token; everything you do is a verb on it. Nesting lives in the **slug**
(`my-epic/login/setup`), never in the grammar.

## Three verb levels

```
anchored <tier> <stage>                          # lifecycle    — plan refine build wrap
anchored <tier> <verb> <slug> [args]             # node         — get set status create archive reset
anchored <tier> <collection> <op> <slug> [args]  # sub-resource — ac question child …
```

- **Lifecycle** returns the orchestration plan (the stage's steps + the node) — it
  mutates nothing.
- **Node + collection** verbs mutate (or read) the node, each through the validating,
  atomic-writing store. The schema is the only law — an `ac` never reaches
  `status: done` without `evidence` (enforced on every write).
- **`list` and `get` are universal collection read-ops** — every collection (`ac`,
  `child`, `phase`, `acceptance`, `question`, `concern`, `rule`) answers `<collection>
  list <slug>` (all items) and `<collection> get <slug> <id>` (one item) on top of
  `add` and its domain ops. The pattern is regular, so an agent derives them — they are
  not bespoke per collection. (Exception: `log` is list-only — its entries carry no id,
  so there is no `log get`.)

---

## phase

A phase is the **leaf** — it has no own file (it lives in its task's `phases[]`) and
no lifecycle stages. Address it under its task: `<task>/<phase>` (e.g.
`my-epic/login/setup`). Advance it with `phase status <slug> done`.

| command | purpose |
|---|---|
| `phase get <slug>` | read the phase object |
| `phase set <slug> <field> <value>` | set a free field (e.g. `depends_on` — a comma list → array); `status`/`acceptance_criteria`/`rules`/`slug` are reserved |
| `phase status <slug> <to>` | transition the phase status (`done` requires every AC terminal — done or deferred — AND a receipt per served build step) |
| `phase ac add <slug> <text> [id]` | add an acceptance criterion |
| `phase ac list <slug>` | list the phase's acceptance criteria |
| `phase ac get <slug> <id>` | read one acceptance criterion |
| `phase ac evidence <slug> <id> <text>` | attach proof + flip the AC to `done` (retires prior failures) |
| `phase ac done <slug> <id>` | explicit `done` (only succeeds if evidence is already present — the store enforces it) |
| `phase ac fail <slug> <id> <text>` | record a gate rejection + flip the AC back to `pending` (evidence stays as history) |
| `phase ac defer <slug> <id> <reason>` | defer the AC with a reason (terminal; schema enforces the reason) |
| `phase ac set <slug> <id> text <value>` | edit an AC's text (only `text` is settable) |
| `phase rule add <slug> <path> <why>` | attach (or update) a rule reference on the phase |
| `phase rule list <slug>` | list the phase's rule references |
| `phase rule get <slug> <id>` | read one rule reference |
| `phase step done <slug> <stage> <step> [note]` | receipt an executed pipeline step (step enforcement — `status done` requires completeness) |
| `phase step skip <slug> <stage> <step> <reason>` | document a deliberately-not-run step (reason required — schema-enforced) |
| `phase step list <slug>` | list the phase's step receipts |

## task

A task owns its lifecycle (`plan/refine/build/wrap`), its node verbs, and the
**phase-existence** collection (the parent owns child existence + order; the phase
module owns phase content). Slug: `<epic>/<task>` (nested) or a bare standalone slug.

| command | purpose |
|---|---|
| `task plan <slug>` | return the plan-stage orchestration plan |
| `task refine <slug>` | return the refine-stage orchestration plan |
| `task build <slug>` | return the build-stage orchestration plan (incl. `each_steps` — the phase pipeline, served so the orchestrator never works from memory) |
| `task wrap <slug>` | return the wrap-stage orchestration plan |
| `task get <slug>` | read the task node |
| `task create <slug> [title]` | create a new task file (status `plan`) |
| `task set <slug> <field> <value>` | set a free field (dotted paths allowed, e.g. `context.plan`); managed fields are reserved |
| `task status <slug> <to>` | transition the task lifecycle status (`build` needs no open questions; `done` needs every phase terminal + no open concern) |
| `task archive <slug>` | move the task file to the archive (through the validated path) |
| `task reset <slug>` | remove the task file |
| `task phase add <slug> <phaseSlug> [name]` | add a phase stub (existence + order) |
| `task phase list <slug>` | list the task's phases |
| `task phase get <slug> <phaseSlug>` | read one phase stub |
| `task phase next <slug>` | the next runnable phase (in-flight wins, else first ready by `depends_on`) |
| `task phase ready <slug>` | all phases whose dependencies are met |
| `task question add <slug> <text> [priority]` | add an open question (`low`/`medium`/`high`, default `medium`) |
| `task question list <slug>` | list the task's questions |
| `task question get <slug> <id>` | read one question |
| `task question resolve <slug> <id> <answer> [source] [reasoning]` | resolve a question (`source` `user`/`ai`) |
| `task concern add <slug> <text> [priority]` | add a wrap-time concern |
| `task concern list <slug>` | list the task's concerns |
| `task concern get <slug> <id>` | read one concern |
| `task concern resolve <slug> <id> <answer> [source] [reasoning]` | resolve a concern |
| `task log add <slug> <at> <kind> <note>` | append a log entry to the audit trail |
| `task log list <slug>` | list the audit-trail log entries (list-only — entries have no id) |
| `task step done <slug> <stage> <step> [note]` | receipt an executed stage step (the stage-closing transition requires completeness) |
| `task step skip <slug> <stage> <step> <reason>` | document a deliberately-not-run step (reason required — schema-enforced) |
| `task step list <slug>` | list the task's step receipts |

## epic

An epic owns its lifecycle, its node verbs, the **task-stub** collection (the loop
queue: child existence + per-stub outcome ACs + roll-up), and its Definition-of-Done
`acceptance` items. Slug: the epic name.

| command | purpose |
|---|---|
| `epic plan <slug>` | return the plan-stage orchestration plan |
| `epic refine <slug>` | return the refine-stage orchestration plan |
| `epic build <slug>` | return the build-stage orchestration plan |
| `epic wrap <slug>` | return the wrap-stage orchestration plan |
| `epic get <slug>` | read the epic node |
| `epic create <slug> [title]` | create a new epic (status `plan`, empty task list) |
| `epic set <slug> <field> <value>` | set a free field (dotted paths allowed, e.g. `context.refine`); managed fields are reserved |
| `epic status <slug> <to>` | transition the epic lifecycle (`build` needs no open questions; `done` needs every stub `done`, no open concern, every DoD item terminal) |
| `epic archive <slug>` | archive the epic — cascades to its delivered (`done`) child task files |
| `epic reset <slug>` | remove the epic |
| `epic child add <slug> <childSlug> [goal] [depends_on]` | add a task-stub to the loop queue (`depends_on` comma-separated) |
| `epic child list <slug>` | list the epic's task-stubs |
| `epic child get <slug> <childSlug>` | read one task-stub |
| `epic child next <slug>` | the next runnable stub |
| `epic child ready <slug>` | all stubs whose dependencies are met |
| `epic child status <slug> <childSlug> <status>` | set a stub's status (delivered when its child task's phases are all done — outcome ACs verified at roll-up, not here) |
| `epic child set <slug> <childSlug> <field> <value>` | set a free stub field (e.g. `depends_on` — comma list → array); `slug`/`status`/`acceptance_criteria` reserved |
| `epic child ac add <slug> <childSlug> <text>` | add an outcome AC to the stub |
| `epic child ac list <slug> <childSlug>` | list the stub's outcome ACs |
| `epic child ac get <slug> <childSlug> <id>` | read one outcome AC |
| `epic child ac evidence <slug> <childSlug> <id> <proof>` | evidence the stub's outcome AC |
| `epic child ac fail <slug> <childSlug> <id> <why>` | fail the stub's outcome AC |
| `epic child ac defer <slug> <childSlug> <id> <reason>` | defer the stub's outcome AC |
| `epic child roll-up <slug>` | read each child task file's status + report the epic's acceptance state |
| `epic acceptance add <slug> <text>` | add a Definition-of-Done item |
| `epic acceptance list <slug>` | list the Definition-of-Done items |
| `epic acceptance get <slug> <id>` | read one Definition-of-Done item |
| `epic acceptance status <slug> <id> <status> [detail]` | set a DoD item (`done` needs delivery evidence as `detail`; `deferred` needs a reason) |
| `epic question add <slug> <text> [priority]` | add an open question |
| `epic question list <slug>` | list the epic's questions |
| `epic question get <slug> <id>` | read one question |
| `epic question resolve <slug> <id> <answer> [source] [reasoning]` | resolve a question |
| `epic concern add <slug> <text> [priority]` | add a wrap-time concern |
| `epic concern list <slug>` | list the epic's concerns |
| `epic concern get <slug> <id>` | read one concern |
| `epic concern resolve <slug> <id> <answer> [source] [reasoning]` | resolve a concern |
| `epic log add <slug> <at> <kind> <note>` | append a log entry |
| `epic step done <slug> <stage> <step> [note]` | receipt an executed stage step (the stage-closing transition requires completeness) |
| `epic step skip <slug> <stage> <step> <reason>` | document a deliberately-not-run step (reason required — schema-enforced) |
| `epic step list <slug>` | list the epic's step receipts |
| `epic log list <slug>` | list the audit-trail log entries (list-only — entries have no id) |

## meta

| command | purpose |
|---|---|
| `anchored validate` | validate the merged template (default ⨉ user `anchored.yml`) |
| `anchored help` | list every tier and its verb surface |
| `anchored version` | print the CLI version |

---

## Output conventions

- **Default = one dense readable line** (no ANSI, nothing truncated, full values).
  Nothing to parse — read the state straight off the line. The orchestrator is
  always an agent, so this agent format simply *is* the default (no human mode, no
  env detection).
  ```
  task status core-todo build · slug: core-todo · status: build · next: status → wrap
  phase ac evidence core-todo/markup a1 "addTask() at app.js:27 …" · ac: 3 · next: evidence: a2, a3
  ```
- **`next:` hint** — every line carries the pre-parameterised next action (next phase /
  ready batch / next stage / criteria still to evidence), so the loop never needs a
  second "what's next?" call.
- **`--json`** — a global flag (place it anywhere in argv). Emits the raw envelope
  `{ ok, command, next?, result | error }` for jq/structured reads instead of the line.
- **Errors** prescribe the fix + return a non-zero exit code. The line is
  `<command> · error[<Kind>]: <message> · fix: <suggestion>` — failure is visible
  without parsing.
- **Idempotent transitions** — a `status` set to the current state is safe to repeat
  (declare intent, never handle "already X").

## Input conventions

- **Identifiers are positional words** — tier, verb, slug, status value, AC id, flags.
  Do not wrap a simple call in a JSON object.
- **`-` reads one body value from stdin** — for big prose (evidence, `context.plan`,
  refine trail) or a bulk payload. Exactly one `-` per call; it swaps the channel,
  the tier verb still Zod-validates the value.
  ```
  anchored phase ac evidence core-todo/markup a2 - <<'TXT'
  addTask() (app.js:27) — verified via the render test …
  TXT
  ```
