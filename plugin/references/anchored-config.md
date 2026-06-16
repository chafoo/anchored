# anchored-config — the `anchored.yml` format + everything you can configure

> Reference for a project's `anchored.yml` — every setting it can carry. A real user
> `anchored.yml` holds **deltas only**: whatever it does not override comes from the merged
> default base. The shipped default template is `core/default-template/anchored.default.yml`;
> its shape — every tier's stages, steps, and `fields` — is documented inline below (the
> built-in-steps table + the fields section), so this file is self-contained.

## Structure: tiers × stages × steps

The top level is the **tiers** (`phase` · `task` · `epic`; epic is the top tier).
Every tier has the same four **stages** (`plan` · `refine` · `build` · `wrap`), and
each stage has an ordered `steps` list.

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

A step is an entry in `steps`. Its shape is uniform across every tier and stage:

```
{ name, instructions?, use?: { type, name }, execute? }
```

| Field | Required | Value |
|---|---|---|
| `name` | **required** | the step's label (reserved name for a default step; any name for a custom one) |
| `instructions` | optional | prose the main thread follows when it runs the step — a command lives **here**, as prose |
| `use` | optional | the worker to spawn: `{ type: agent\|skill, name: <worker> }` |
| `execute` | optional | `sequential` (default) \| `workflow` — the per-step fan-out knob (see below) |
| `involve` | on `walk` only | `all` \| `high-only` \| `none` |
| `each` (+`steps`) | on the build loop only (see below) | the child tier to iterate |

**There is no `run:` step key** — commands are not a separate step type. Whatever a
step should execute (a shell command, a CLI call, an ordering condition) is expressed
as prose in `instructions:`. Likewise there is no bare `worker:` / `type:` field on a
step: the worker is always the nested `use: { type, name }`.

**Invariants:** `instructions` is allowed on **every** step (worker step or
prose-only) · `type` lives inside `use`, never as a top-level step key · default steps
carry the worker that matches the shipped default template and are
**not removable / not reorderable** — only extendable via `instructions` (append).

```yaml
# Default step, steered only (instructions appended to its built-in worker):
- { name: implement, instructions: "always test-driven development: red → green → refactor" }

# Default walk with involve:
- { name: walk, use: { type: skill, name: walk }, involve: high-only }

# Custom prose-only step (the command lives in instructions):
- { name: lint, instructions: "run `npm run check`; fail the step on a non-zero exit" }

# Custom worker step, isolated subagent:
- { name: docu-scan, use: { type: agent, name: docu-scan } }

# Custom worker step, in-session skill, with instruction:
- { name: pr-review, use: { type: skill, name: pr-reviewer }, instructions: "re-scan touched modules only" }
```

> **`instructions:` is allowed on EVERY step** — prose the AI follows when it runs
> or dispatches the step. On a prose-only step it carries the command itself plus HOW
> to run it (conditions, how to treat output/errors, ordering — e.g. *"run this AFTER
> the task has flipped to done"*); on a `use:` step it is passed through to the worker;
> on a default step it extends its behaviour (append). There is no special flag for
> "after done" — the ordering lives in the `instructions`.

### Steering a gate with rationalizations / evidence prose

The gate steps (`implement` · `task-validate` · `code-validate`, all under the
**`phase`** tier's `build`) are the highest-leverage place to add soft steering — a
rationalizations table (the excuses the AI is tempted by, rebutted) or an evidence
taxonomy (what concrete proof looks like). Your `instructions` is **appended** to the
worker's default brief. Keep it short and one-concern-per-step — see
`plugin/references/step-authoring.md` for the why and the reusable shapes.

```yaml
phase:
  build:
    steps:
      - name: implement
        instructions: |
          Test-driven by default: red → green → refactor.
          Don't rationalize past the self-check:
          - "I'll add the test later" → you won't; after-the-fact tests test the impl, not behaviour.
          - "too simple to test" → simple code still needs a concrete result.
      - name: task-validate
        instructions: |
          Evidence per acceptance criterion must be concrete (anything vaguer is a fail):
          - logic → a committed test + its green run output (N/N)
          - a bug fix → the reproduction test, failing before and passing after
          - a CLI change → the real invocation and its output
          Reject "should work" and any claim anchored on a raw line number, not a symbol.
```

> Want a rule **binding** rather than nudged? Prose can't do that — write a check
> instead: a custom step whose command (in its `instructions`) exits non-zero on
> violation, so the runner acts on the exit code. The hardness ladder is in
> `step-authoring.md`.

### `execute:` — the per-step fan-out knob

`execute` controls how a **single** step runs:

- `execute: sequential` (default) — the step runs once, in order.
- `execute: workflow` — **this** step fans out (the main thread spawns its work in
  parallel rather than running it as one sequential pass).

`execute` is the **only** parallelism knob in the config, and it is scoped to one
step. **Build-loop parallelism is not a config flag** — there is no `mode:` on
`build`. Running several children of a build loop at once is plugin orchestration via
`depends_on`: ready children fan out, and the dependency chain sequences the rest. The
config never declares "run the loop in parallel"; it only declares, per step, whether
that step fans out (`execute: workflow`).

### Referring to slugs in `instructions:`

A step's `instructions:` prose can reference the unit it runs against by slug. Which
slugs are in scope depends on the stage:

| Slug | Meaning | In scope for |
|---|---|---|
| the task slug | the task (the task-file); for an epic child, the child slug | all build/wrap steps |
| the phase slug | the phase just built | `phase.build` only |
| the phase name | the phase's plain-text name | `phase.build` only |
| the epic slug | the parent epic slug, otherwise empty | all build/wrap steps |

> **branch-per-task — flatten the slug:** an epic child slug is *nested*
> (`myepic/core-list`). A raw branch `task/<slug>` can collide with a prefix-related
> sibling (git ref dir/file conflict: `task/x` vs `task/x/y`). Turn slashes into `-`
> in the branch name and it becomes collision-safe (e.g. `myepic/core-list` →
> `task/myepic-core-list`). Spell this out in the step's `instructions:`.

### Position: `after:` / `before:`

A custom step is placed via `after: <step-name>` or `before: <step-name>` relative
to an existing (built-in) step; without an anchor it is **appended at the end**. When
merging with the default template: steps merge *keyed by name* + extend-only — a new
name lands at the anchor position, a known name extends the existing step in place.

```yaml
phase:
  build:
    steps:
      - { name: commit, after: code-validate, instructions: '…' }   # AFTER the gates, on a green phase
      - { name: lint,   before: task-validate, instructions: '…' }  # BEFORE the evidence gate
```

> **Caution — silent append:** if `after:`/`before:` points at a name that does not
> exist in the stage, it does **not** fail — the step lands silently at the end
> (`ok:true`). After editing, check the actual **order** in the stage plan returned by
> `anchored <tier> <stage> <slug>` (its `steps[]`), not just presence.

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
      - { name: notify-start, instructions: '…' }   # once, before the loop
      - name: loop
        each: task                                  # loop body = the task tier, per stub
        steps:
          - { name: run }                            # built-in: run this unit
          - { name: commit, instructions: 'commit the unit by its task slug' }  # right after, per task
      - { name: report, instructions: '…' }         # once, afterwards
```

- **Short form** `build: { each: task }` ≙ `steps: [{ name: loop, each: task, steps: [run] }]`.
- `each` is **intrinsic** (fixed per tier: task→phase, epic→task) —
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
the shipped default template (shape) — the mechanics (status enum, transitions) are
fixed in code.

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
- Default fields are **not** repeated here — `fields` is **additive** (the base comes from the default template); a custom name lands additionally in the node schema, while an
  **un**declared key is still rejected on write.
- Set/read at runtime: `anchored <tier> set <slug> <name> <value>`. On a **child**:
  a stub via `anchored epic child set <epic> <stub> <name> <value>`; a phase
  via `anchored phase set <task>/<phase> <name> <value>` (the phase's slash-joined slug).

### Commit anchors: `commit_sha` vs. `merge_commit` (two-anchor semantics)

When you use commit wiring (see
the commit-step example below), the
task-file carries **two** anchors — additive, no rename (existing specs/docs stay
intact):

- **`commit_sha`** = the **per-phase anchor** (interim). Your per-phase commit step
  writes the `HEAD` SHA here itself after each phase (an `anchored task set …
  "$(git rev-parse HEAD)"` call, expressed in the step's `instructions:`). Caution:
  the phase branch this SHA points at **can be deleted by the task-wrap `--no-ff`
  merge** — `commit_sha` is then an
  orphaned (interim) pointer.
- **`merge_commit`** = the **surviving task-level merge commit**. This is the stable
  anchor on `develop`/`main` that persists after the wrap merge (while the per-phase
  anchor can vanish).

Both are ordinary custom fields (`string`), additively declared.

#### SHA anchors: wire them yourself in the commit step

The framework does **not** fill these fields automatically — git is entirely yours.
In your own commit step you write the SHA via `set` yourself; the command lives
in the step's `instructions:` prose:

```yaml
- name: commit
  after: code-validate
  instructions: |
    Commit the phase, then record the SHA on the task-file:
      git add -A -- ':!.claude/anchored'
      git diff --cached --quiet || git commit -m "phase: <phase-slug>"
      anchored task set <task-slug> commit_sha "$(git rev-parse HEAD)"
```

The framework writes only to the task-file (via the CLI you call from the step) — it
**never** runs git for you. WHAT gets committed, WHICH field receives the SHA, and
WHEN: all **policy** in your `instructions:`. See
the commit-step example below.

## `_lib` — reusable steps (`anchored.yml` only)

YAML anchors are **allowed on the `anchored.yml` path** (user-authored config) to
reuse steps. Node-files stay alias-free.

```yaml
_lib:
  research: &research
    name: research-best-practices
    use: { type: agent, name: researcher }
    instructions: "Current code first (.claude/rules + docs), then online."

epic:
  plan:
    steps:
      - *research                             # reused via alias
      - { name: scaffold }
```

## Where the defaults come from

`effectiveConfig = merge(the default template [framework base], <project>/anchored.yml
[deltas])` — loaded once at bootstrap, injected into the engine as `deps.config`.
That is why a minimal user file suffices.
