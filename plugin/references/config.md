# anchored.yml — configuration format

> Reference for the `anchored.yml` format. The full default config lives in
> [`anchored.default.yml`](anchored.default.yml) (anchored reads all defaults from there). A real
> user `anchored.yml` contains **deltas only** — whatever it does not override comes
> from the merged default base. Example nodes: [`task.example.yml`](task.example.yml),
> [`epic.example.yml`](epic.example.yml).

## Structure: tiers × stages × steps

The top level is the **tiers** (`phase` · `task` · `epic` · `project`). Every tier
has the same four **stages** (`plan` · `refine` · `build` · `wrap`), and each stage
has an ordered `steps` list.

```yaml
task:
  plan:    { steps: [ … ] }
  refine:  { steps: [ … ] }
  build:   { each: phase, stop: [ … ], retry_limit: 3, steps: [ … ] }
  wrap:    { steps: [ … ] }
```

- **`build`** additionally carries `each` / `stop` / `retry_limit` as siblings of
  `steps` (see below).
- Omit a stage or its `steps` → the built-in defaults run.
- The top level is **strict**: unknown keys → error.

## A step

A step is an entry in `steps`. `name` is required; everything else depends on the
type.

| Field | Built-in step | Custom `run:` step | Custom `use:` step |
|---|---|---|---|
| `name` | **required** (reserved name) | **required** | **required** |
| `run` | ✗ | **required** (shell/prose) | ✗ |
| `use` | ✗ | ✗ | **required** (worker) |
| `type` | ✗ | ✗ | optional · `agent` (default) \| `skill` |
| `instructions` | optional (steers the built-in) | optional (guides the `run:`) | optional (to the worker) |
| `involve` | on `walk` only · `all`\|`high-only`\|`none` | ✗ | ✗ |
| `each` (+`steps`) | on `loop` only (see below) | ✗ | ✗ |

**Invariants:** `run` **XOR** `use` (never both) · `type` only with `use` ·
`instructions` is allowed on **every** step (run/use/built-in) · built-ins carry
neither `run` nor `use` (they dispatch themselves) · built-ins are
**not removable / not reorderable** — only extendable via `instructions` (append).

```yaml
# Built-in, steered only:
- { name: implement, instructions: "always test-driven development: red → green → refactor" }

# Built-in walk with involve:
- { name: walk, involve: high-only }

# Custom run-step (shell):
- { name: lint, run: 'npm run check' }

# Custom use-step, isolated subagent (default):
- { name: docu-scan, use: docu-scan }

# Custom use-step, in-session skill, with instruction:
- { name: pr-review, use: pr-reviewer, type: skill, instructions: 're-scan touched modules only' }
```

> **`instructions:` is allowed on EVERY step** — prose the AI follows when it runs
> or dispatches the step. Uniform across `run` / `use` / worker: on a `run:` step it
> guides HOW the AI runs the command (conditions, how to treat output/errors,
> ordering — e.g. *"run this AFTER the task has flipped to done"*); on a `use:` step
> it is passed through to the worker; on a built-in it extends its behaviour
> (append). There is no special flag for "after done" — the ordering lives in the
> `instructions`.

### Variables in `run:` steps

The orchestrator passes every `run:` step these values as **real environment
variables** (`${NAME}` expands in the shell command; never text them in by hand).
Which are available depends on the stage:

| Variable | Value | Available in |
|---|---|---|
| `TASK_SLUG` | the task (the task-file); for an epic child, the child slug | all build/wrap `run:` steps |
| `PHASE_SLUG` | the phase just built | `phase.build` only |
| `PHASE_NAME` | the phase's plain-text name | `phase.build` only |
| `EPIC_SLUG` | the parent epic slug, otherwise empty | all build/wrap `run:` steps |

There is **no** `$SLUG` — the correct name is always `${TASK_SLUG}`. A commit
message like `git commit -am "$SLUG"` silently commits with an **empty** message.

> **branch-per-task — flatten the slug:** an epic child slug is *nested*
> (`myepic/core-list`). A raw branch `task/${TASK_SLUG}` can collide with a
> prefix-related sibling (git ref dir/file conflict: `task/x` vs `task/x/y`).
> Turn slashes into `-` in the branch name and it becomes collision-safe:
> ```bash
> BRANCH="task/$(printf '%s' "${TASK_SLUG}" | tr '/' '-')"   # myepic/core-list → task/myepic-core-list
> ```

### Position: `after:` / `before:`

A custom step is placed via `after: <step-name>` or `before: <step-name>` relative
to an existing (built-in) step; without an anchor it is **appended at the end**. When
merging with the default template: steps merge *keyed by name* + extend-only — a new
name lands at the anchor position, a known name extends the existing step in place.

```yaml
phase:
  build:
    steps:
      - { name: commit, after: code-validate, run: '…' }   # AFTER the gates, on a green phase
      - { name: lint,   before: task-validate, run: '…' }  # BEFORE the evidence gate
```

> **Caution — silent append:** if `after:`/`before:` points at a name that does not
> exist in the stage, it does **not** fail — the step lands silently at the end
> (`ok:true`). After editing, check the actual **order** with
> `anchored steps <tier> <stage>`, not just presence.

## Built-in steps per stage

Reserved `name` values, recognised by the framework (not removable):

| Stage | phase (leaf) | task | epic |
|---|---|---|---|
| `plan` | — | `discover` · `rules-scan` · `decompose` | `discover` · `scaffold` |
| `refine` | — | `plan-check` · `rules-check` · `walk` | `walk` |
| `build` | `implement` · `task-validate` · `code-validate` | `each: phase` | `each: task` |
| `wrap` | — | `review` · `summarize` | `roll-up` |

> Reserved/off-limits for your *own* worker names: `plan`, `explore` (Claude
> Code internal agent types).

## `each`, the loop step

A `build` that iterates children uses a `loop` step with `each: <tier>`. The loop has
a **body** (`steps`) that runs **interleaved** per child (child A fully, then child B
…):

```yaml
epic:
  build:
    steps:
      - { name: notify-start, run: '…' }      # once, before the loop
      - name: loop
        each: task                            # loop body = the task tier, per stub
        steps:
          - { name: run }                      # built-in: run this unit
          - { name: commit, run: 'git commit -am "${TASK_SLUG}"' }  # right after, per task
      - { name: report, run: '…' }            # once, afterwards
```

- **Short form** `build: { each: task }` ≙ `steps: [{ name: loop, each: task, steps: [run] }]`.
- `each` is **intrinsic** (fixed per tier: task→phase, epic→task, project→epic) —
  documentation only, not freely choosable.
- The per-iteration mechanics (advance status, log, `stop` check) are built in.

### `stop` + `retry_limit`

Siblings of `steps` inside `build` (the loop's policy, not steps):

```yaml
build:
  each: task
  stop:                                       # natural-language halt conditions; halts on the first match
    - 'an architectural boundary is crossed (layer, dependency graph, contract)'
  retry_limit: 3                              # how many times a failing unit is re-run
```

## Fields (`fields`)

Every tier carries a data model. The **default fields** per tier live in
[`anchored.default.yml`](anchored.default.yml) (shape) — the mechanics (status enum, transitions) are
fixed in code. Example values: [`task.example.yml`](task.example.yml) /
[`epic.example.yml`](epic.example.yml).

> **Hard invariant (not switchable off):** an `ac` only goes to `done` when
> `evidence` is present. *How* the evidence is produced is yours to configure freely.

### Adding your own field

Custom fields are declared at the **tier** they belong to — under its `fields`, as a
**record** (`name: type`, NOT a list of `{name, type}`):

```yaml
phase:
  fields:                                     # custom fields of the phase tier
    coverage_pct: number                      # e.g. one number per phase

task:
  fields:
    commit_sha: string                        # custom field on the task-file
    ticket_url: string
```

- **Record form, not list:** `commit_sha: string` ✓ — `- { name: commit_sha,
  type: string }` ✗ (the schema expects a map `name → type`).
- `type`: `string` | `number` | `boolean` (scalar-typed) — everything else passes
  through as `unknown` (permissive, but persisted).
- Default fields are **not** repeated here — `fields` is **additive** (the base comes
  from `anchored.default.yml`); a custom name lands additionally in the node schema, while an
  **un**declared key is still rejected on write.
- Set/read at runtime: `anchored node set-field <slug> <name> <value>`. On a
  **child** (stub/phase): `anchored node set-child-field <slug> <child> <name> <value>`.

### Commit anchors: `commit_sha` vs. `merge_commit` (two-anchor semantics)

When you use commit wiring (see
[`anchored.example-comprehensive.yml`](anchored.example-comprehensive.yml)), the
task-file carries **two** anchors — additive, no rename (existing specs/docs stay
intact):

- **`commit_sha`** = the **per-phase anchor** (interim). Your per-phase commit step
  writes the `HEAD` SHA here itself after each phase (`anchored node set-field …
  "$(git rev-parse HEAD)"` inside `run:`). Caution: the phase branch this SHA points
  at **can be deleted by the task-wrap `--no-ff` merge** — `commit_sha` is then an
  orphaned (interim) pointer.
- **`merge_commit`** = the **surviving task-level merge commit**. This is the stable
  anchor on `develop`/`main` that persists after the wrap merge (while the per-phase
  anchor can vanish).

Both are ordinary custom fields (`string`), additively declared.

#### SHA anchors: wire them yourself in the `run:` step

The framework does **not** fill these fields automatically — git is entirely yours.
In your own commit step you write the SHA via `set-field` yourself:

```yaml
- name: commit
  after: code-validate
  run: |
    git add -A -- ':!.claude/tasks'
    git diff --cached --quiet || git commit -m "phase: ${PHASE_SLUG}"
    anchored node set-field "${TASK_SLUG}" commit_sha "$(git rev-parse HEAD)"
```

The framework writes only to the task-file (via the CLI you call inside `run:`) — it
**never** runs git for you. WHAT gets committed, WHICH field receives the SHA, and
WHEN: all **policy** in your `run:`. See
[`anchored.example-comprehensive.yml`](anchored.example-comprehensive.yml).

## `_lib` — reusable steps (`anchored.yml` only)

YAML anchors are **allowed on the `anchored.yml` path** (user-authored config) to
reuse steps. Node-files stay alias-free.

```yaml
_lib:
  research: &research
    name: research-best-practices
    use: researcher
    instructions: "Current code first (.claude/rules + docs), then online."

epic:
  plan:
    steps:
      - *research                             # reused via alias
      - { name: scaffold }
```

## Where the defaults come from

`effectiveConfig = merge(anchored.default.yml [framework base], <project>/anchored.yml
[deltas])` — loaded once at bootstrap, injected into the engine as `deps.config`.
That is why a minimal user file suffices.
