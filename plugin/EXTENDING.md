# Extending anchored

Everything you can configure lives in one file: `anchored.yml` at your
project root. The framework ships with sensible defaults — you only
write what you want to change.

## The anchored.yml shape

```yaml
task:
  phase:
    fields: []          # custom phase fields (e.g. commit SHA, coverage %)

plan:
  steps: []             # custom steps that run during /impl-plan

refine:
  steps: []             # custom steps that run during /impl-refine
  plan_check:
    instructions: ""    # extend the plan-check gate prompt
  rules_check:
    instructions: ""    # extend the rules-check gate prompt

build:
  retry_limit: 3        # max failure-driven retries per phase
  steps: []             # custom steps that run after each phase
  task_validate:
    instructions: ""    # extend the task-validate gate prompt
  code_validate:
    instructions: ""    # extend the code-validate gate prompt

wrap:
  steps: []             # custom steps that run during /impl-wrap
```

Every value above is the default. You only uncomment + edit the slots
you want to customize.

## Four ways to extend

### 1. Add a custom step to any stage

A step is `{ name, run: '<shell command>' }`. Steps run in declaration
order after the framework's default work for that stage completes.

```yaml
build:
  steps:
    - name: commit
      run: 'git add -A && git commit -m "phase: ${PHASE_SLUG}"'
```

Available env vars depend on the stage — only `build.steps` runs inside a
per-phase loop, so only it has phase context:

| Stage         | Available env vars                                          |
| ------------- | ----------------------------------------------------------- |
| `plan.steps`  | `${TASK_SLUG}`, `${TASK_TITLE}`                             |
| `refine.steps`| `${TASK_SLUG}`, `${TASK_TITLE}`                             |
| `build.steps` | `${TASK_SLUG}`, `${TASK_TITLE}`, `${PHASE_SLUG}`, `${PHASE_NAME}` |
| `wrap.steps`  | `${TASK_SLUG}`, `${TASK_TITLE}`                             |

A non-zero exit code halts the pipeline.

### 2. Declare a custom phase field

A field is a typed slot every phase carries. The framework lets you
read/write it via `anchored field set` / `field get`.

```yaml
task:
  phase:
    fields:
      - name: commit
        type: string
      - name: coverage_pct
        type: number
```

Supported types: `string`, `number`, `boolean`, `enum` (with `values:`).

Then write to it from a custom step:

```yaml
build:
  steps:
    - name: commit-and-record
      run: |
        git add -A && git commit -m "phase: ${PHASE_SLUG}"
        SHA=$(git rev-parse HEAD)
        anchored field set ${TASK_SLUG} ${PHASE_SLUG} commit "${SHA}"
```

### 3. Extend the quality gates

The four mandatory gates (plan-check, rules-check, task-validate,
code-validate) can be extended with `instructions:` prose. Your text
gets **appended** to the gate's default prompt — never replaces it.

```yaml
refine:
  plan_check:
    instructions: |
      Every AC must reference its paired test-file before implementation.
      Flag any phase that leads with implementation code instead of tests.
```

You cannot disable gates — that's the framework's contract. Extending
is the only knob.

### 4. Bring your own methodology

Combine the above to enforce architectural principles. Example: TDD +
Functional Core / Imperative Shell:

```yaml
refine:
  plan_check:
    instructions: |
      TDD: every AC paired with a test-file reference, test-first in
      phase context.
      FC/IS: pure functions in `core/`, IO/DOM/storage in `shell/`.
      Flag drift in either dimension.

build:
  code_validate:
    instructions: |
      Verify Functional Core, Imperative Shell separation: no DOM/
      localStorage/Date/crypto calls inside `core/` files. The shell
      may call into core; core never calls shell.
```

## Common patterns

A few useful recipes:

**Per-phase commit + SHA capture**

```yaml
task:
  phase:
    fields:
      - { name: commit, type: string }
build:
  steps:
    - name: commit
      run: |
        git add -A && git commit -m "phase: ${PHASE_SLUG}"
        anchored field set ${TASK_SLUG} ${PHASE_SLUG} commit "$(git rev-parse HEAD)"
```

**Slack notify on wrap**

```yaml
wrap:
  steps:
    - name: notify
      run: |
        curl -X POST $SLACK_WEBHOOK_URL \
          -d "{\"text\": \"Task ${TASK_SLUG} done\"}"
```

**PR creation on wrap (only if remote exists)**

```yaml
wrap:
  steps:
    - name: pr
      run: |
        if git remote get-url origin >/dev/null 2>&1; then
          gh pr create --title "${TASK_TITLE}" \
            --body "$(anchored task read ${TASK_SLUG})"
        fi
```

**Coverage gate via custom validator**

```yaml
task:
  phase:
    fields:
      - { name: coverage_pct, type: number }
build:
  code_validate:
    instructions: |
      After verifying rule adherence, run `npm run test:coverage` and
      record the coverage percentage to phase.coverage_pct. Reject the
      phase if coverage drops below 80%.
```

## Running phases as a Dynamic Workflow

A phase can opt into **parallel fan-out** during `/impl-build` by
setting its `executor` to `workflow`. Instead of one sequential
`implement` agent, the phase's acceptance criteria are spread across
parallel unit-workers ([`plugin/agents/workflow.md`](./plugin/agents/workflow.md))
— useful for phases with many independent ACs.

Set it at plan/refine time with the CLI:

```bash
anchored phase executor set <slug> <phase-slug> workflow
# back to the default sequential worker:
anchored phase executor set <slug> <phase-slug> implement
```

`executor` is **absent by default**, which means `implement` (the
unchanged sequential path). Everything downstream is identical for
both executors — the `task-validate` + `code-validate` gates still run
**once over the merged phase result** (never per-unit, never
bypassed), and the failures-driven retry loop and retry-limit are
unchanged.

If the Dynamic Workflow runtime is unavailable (older Claude Code,
no Workflow runtime, or a dispatch error), an `executor: workflow`
phase **falls back to the sequential `implement` path automatically**
— it never hard-errors. Detection is empirical (the skill probes the
runtime); there is no config flag to toggle.

### Required: pre-approve the `anchored` CLI in the tool allowlist

Workflow unit-workers write their own evidence/failures to the
task-file via the `anchored` CLI (not MCP). A **background** workflow
has no one to answer an interactive permission prompt, so these
commands **must be pre-approved in your tool allowlist** before a
workflow phase runs — otherwise the first unit-worker hangs forever
on a permission prompt and stalls the whole fan-out. Add (e.g. in
`.claude/settings.json` `permissions.allow`):

```jsonc
{
  "permissions": {
    "allow": [
      "Bash(anchored ac evidence set:*)",
      "Bash(anchored ac failures set:*)"
      // or broaden to "Bash(anchored ac:*)" / "Bash(anchored:*)"
    ]
  }
}
```

This requirement applies ONLY to phases using `executor: workflow`.
The default sequential `implement` path needs no special allowlist —
it routes all task-file writes through MCP from the skill, not the CLI
from a subagent.

## Reference

- Annotated default `anchored.yml`: [`plugin/references/default-config.yml`](./plugin/references/default-config.yml)
- JSON schema (for IDE autocomplete + validation):
  [`plugin/references/schema/anchored-yml.schema.json`](./plugin/references/schema/anchored-yml.schema.json)
- Task-file shape: [`plugin/references/task-file-schema.md`](./plugin/references/task-file-schema.md)
