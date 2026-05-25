---
slug: anchored-yml-customs
status: draft
created: 2026-05-25
---

# anchored.yml — customs & extensions

How users tailor `anchored.yml` to their project: overriding default
steps, adding new steps, extending fixed agents, declaring custom phase
fields, and worked examples for common patterns (per-phase commits,
coverage tracking, PR linking, etc.).

For the **framework's default behavior reference** — what runs out of
the box without any configuration — see
[anchored-yml-defaults.md](./anchored-yml-defaults.md).

---

## Override vs merge — what happens when you reuse a default step name

The framework distinguishes between two step types. **Same-name** prose
in `anchored.yml` is treated differently depending on type:

| Step type        | Examples                                                  | Same-name user prose effect |
|------------------|-----------------------------------------------------------|-----------------------------|
| Replaceable step | `explore`, `rules`, `refine`, `implement`, `review`, `summarize` | **REPLACES** the default prose entirely |
| Fixed agent      | `task_check`, `code_check`                                | **APPENDED** to default prose; never replaces |

The rule: **step type determines semantic, no special syntax needed.**
You write the same key whether you mean to extend or replace — the
framework knows which mode applies based on whether the step is fixed
or replaceable.

### Replaceable steps — replace semantics

If you write `implement: |` in your `anchored.yml`, your prose is what
the AI executes. The default `implement` agent's prose is NOT loaded.

This gives you full control: swap to a different agent, specify a
methodology (TDD, BDD, code-first, spike-then-rewrite, anything), or
integrate other tools — write what you want.

```yaml
build:
  # Fully replaces the default implement agent's prose
  implement: |
    Spawn the `my-bdd-worker` agent for this phase. Pass the phase
    context and acceptance criteria. The agent uses Gherkin scenarios
    instead of unit tests. Capture each scenario's outcome as evidence
    via mcp__anchored__ac_evidence_set.
```

**If you want to extend (not replace) a replaceable default**, two
patterns work:

1. **Copy + extend in the same key** — copy the default prose from
   [defaults.md](./anchored-yml-defaults.md), add your additions below
   it. Trade-off: future framework updates to the default won't reach
   your config automatically.

2. **Add a new step at a different name** — leave the default alone,
   insert your step at a different position. Cleaner; see "Adding a
   custom step" below.

### Fixed agents — append semantics

`task_check` and `code_check` are anchored's quality gate. They always
run during `/impl-build`, even if you don't mention them in
`anchored.yml`. If you write `task_check: |` prose, it's **APPENDED**
to the default `task-check` agent's instructions — adds your
project-specific checks on top of the framework's evidence-honesty
check.

```yaml
build:
  # Appended to the default task-check agent's instructions
  task_check: |
    Beyond default checks, also verify that metadata fields declared
    in task.phase.fields are preserved on the phase block.
```

You cannot replace or disable fixed agents — they enforce the anchored
USP ("no AC done without honest evidence"). If you want different
quality checks, write them as ADDITIONAL steps in your pipeline; the
fixed agents will still run alongside.

### Quick reference

| What you want                                  | How                                              |
|------------------------------------------------|--------------------------------------------------|
| Use framework defaults as-is                   | Don't add the key at all                         |
| Replace a default behavior                     | Add the same-name key (works for replaceable)    |
| Add to default behavior (replaceable steps)    | Add a step at a NEW name in the right position   |
| Add to fixed-agent checks                      | Add the same-name key — auto-appended            |
| Disable a default behavior                     | Not supported for fixed agents; for replaceable steps, replace with prose like "skip — handled elsewhere" |

---

## Schema-extension section (`task:`)

Top-level container that mirrors the artifact hierarchy: a task contains
phases, phases have fields. V0.2 ships with phase-level extensions only;
the structure is future-proof for task-level extensions when real demand
emerges.

```yaml
task:
  phase:
    fields:
      - { name: <field_name>, type: <string|number|boolean|enum> }
      - { name: <field_name>, type: enum, values: [a, b, c] }
```

**Available slots in V0.2:**

| Slot                    | Purpose                                              | Example                                |
|-------------------------|------------------------------------------------------|----------------------------------------|
| `task.phase.fields`     | additional per-phase fields preserved on round-trip  | `commit`, `coverage_pct`, `pr_url`     |

**Reserved for V0.3+ when real use-cases emerge:**

| Slot                    | Future purpose                                        |
|-------------------------|-------------------------------------------------------|
| `task.fields`           | task-level frontmatter extensions (e.g. `jira_id`)    |
| `task.phase.status.add` | additive phase-status enum values                     |
| `task.status.add`       | additive task-status enum values                      |
| `task.sections.add`     | custom body sections preserved on round-trip          |

**Round-trip guarantee:** the service-layer reads, mutates, and re-renders
task-files without losing any declared extension content. A `commit:`
line in a phase block, once `task.phase.fields` declares it, survives
every mutation cycle untouched unless explicitly modified through
service-layer field ops.

---

## Variable notation in step prose

Both styles are understood by the AI; pick by readability for your case.

| Notation                | Resolves to                                                  |
|-------------------------|--------------------------------------------------------------|
| `$TASK_SLUG`            | current task slug (env var; bash-compatible in shell calls)  |
| `$PHASE_NAME`           | current phase human name                                     |
| `$PHASE_SLUG`           | current phase internal slug                                  |
| `$phase.field.<name>`   | service-layer `phase.field.set/get` target                   |
| `$task.field.<name>`    | service-layer `task.metadata.set/get` target (V0.3+)         |

**Convention:** `$UPPERCASE` for plain values you'd pass to shell
commands. Dot-notation `$phase.field.X` for service-layer mutation
targets. Plain English ("the phase's commit field") works equally
well — the AI maps both to the same service-layer ops.

---

## Adding a custom step

Custom steps you add at NEW names (not matching any default) sit in the
pipeline at their declared position. File order = execution order.

Example: insert a baseline-lint step between `explore` and `refine` in
`/impl-plan`:

```yaml
plan:
  explore: |
    [default — see defaults.md, leave untouched]
  
  # Custom step inserted between explore and rules
  baseline_lint: |
    Run `eslint --output-file=.anchored/baseline.json` to record any
    pre-existing issues so they aren't blamed on this task. Add a
    summary note to ### Plan under Context.
  
  rules: |
    [default]
  
  refine: |
    [default]
```

### Naming conventions for custom steps

- **Avoid** the names of replaceable defaults (`explore`, `rules`,
  `refine`, `implement`, `review`, `summarize`) unless you intend to
  replace.
- **Avoid** the names of fixed agents (`task_check`, `code_check`)
  unless you intend to extend.
- **Use snake_case** — matches YAML key convention + env-var style.
- **Be descriptive** — the name appears in logs and summaries.
- **Match step name to feature name** when both exist (e.g., field
  `commit` ↔ step `commit`) for visual association.

---

## Adding a custom feature — worked example: per-phase commits

The pattern for any user-added feature: **declare the field** in
`task.phase.fields`, **add a step** with the same name. Convention is
field-name = step-name so the visual link is obvious when reading
the file.

```yaml
task:
  phase:
    fields:
      - { name: commit, type: string }     # used by build.commit step below

# ═══════════════════════════════════════════════════════════════════════
# /impl-build
# ═══════════════════════════════════════════════════════════════════════
build:
  implement: |
    [default]
  
  task_check: |
    [extends default task-check with project-specific checks]
  
  code_check: |
    [extends default code-check with project-specific checks]
  
  # Uses task.phase.fields.commit declared above
  commit: |
    After all checks pass: run `git add -A` and 
    `git commit -m "feat($TASK_SLUG): $PHASE_NAME"`.
    Store the resulting SHA in the phase's commit field.

# default — framework guarantees (per phase, around your steps):
#   ... (unchanged — see defaults.md)
```

**How the AI processes this:**

1. Reads `task.phase.fields` at startup, learns `commit` is a declared
   string-typed phase field.
2. When executing the `commit:` step, sees "store the resulting SHA in
   the phase's commit field".
3. Calls service-layer: `phase.field.set($TASK_SLUG, $PHASE_SLUG, "commit", "<sha>")`.
4. Service-layer validates: field declared (✓), type matches string
   (✓), writes atomically to task-file.

**Result in the task-file:**

```markdown
### Token Storage Layer
<!-- id: token-storage-layer -->
- status: done
- commit: abc1234
- acceptance_criteria:
  - token-store interface defined
    evidence: src/auth/store.ts:42 — TokenStore interface
```

**Same pattern works for any feature.** Examples:

| Feature              | Field declaration                                        | Step that fills it                                       |
|----------------------|----------------------------------------------------------|----------------------------------------------------------|
| Coverage tracking    | `{ name: coverage_pct, type: number }`                   | Run coverage tool, write percentage via `phase.field.set`|
| PR linking           | `{ name: pr_url, type: string }`                         | After push: `gh pr create --fill`, capture URL           |
| Reviewer assignment  | `{ name: reviewer, type: string }`                       | Pick from team list, ping via Slack, set field           |
| Phase tier           | `{ name: tier, type: enum, values: [hot, warm, cold] }`  | Manual assignment in plan, or computed in build          |

**Two-place edit:** declare field → add step. Anchored's source code
never touched. The framework already knows everything via the typed
field-ops at service-layer level.

---

## Optional: feature index comment at file top

For projects with many custom fields and steps, an index comment at the
top of `anchored.yml` helps navigation:

```yaml
# ═══════════════════════════════════════════════════════════════════════
# Features active in this project:
#   • commit       → task.phase.fields.commit       + build.commit step
#   • coverage_pct → task.phase.fields.coverage_pct + build.coverage step
#   • pr_url       → task.phase.fields.pr_url       + wrap.create_pr step
# ═══════════════════════════════════════════════════════════════════════

task:
  phase:
    fields:
      - { name: commit, type: string }
      - { name: coverage_pct, type: number }
      - { name: pr_url, type: string }

build:
  ...
```

Pure convention. Anchored doesn't enforce or generate this — but
recommending it in the docs helps users keep large configs readable.

---

## Worked example: minimal config that pins down implementation methodology

The default `implement` agent is methodology-agnostic — it just says
"implement the AC and capture evidence". To pin it to a specific
methodology (BDD shown below; same pattern works for TDD, code-first,
spike-then-rewrite, etc.), replace the prose:

```yaml
build:
  # Replaces the default implement agent's prose
  implement: |
    For each acceptance criterion in this phase, write a Gherkin
    scenario under features/. Then implement step-definitions under
    features/step_definitions/. Run `cucumber-js` to verify each
    scenario passes. Capture the scenario name + status as evidence
    for the corresponding AC via mcp__anchored__ac_evidence_set.
```

Everything else uses framework defaults: explore/rules/refine in
/impl-plan, task-check/code-check still run as quality gates,
review/summarize in /impl-wrap, all status transitions and validations
happen automatically.

**Effective config size:** 8 lines for a complete methodology switch.

---

## Worked example: maximal config (every knob turned)

To show the full extension surface, here's an example using every
available customization slot:

```yaml
# ═══════════════════════════════════════════════════════════════════════
# Features active in this project:
#   • commit, coverage_pct, pr_url
#   • jira_sync via wrap.sync_jira step
# ═══════════════════════════════════════════════════════════════════════

task:
  phase:
    fields:
      - { name: commit, type: string }
      - { name: coverage_pct, type: number }
      - { name: pr_url, type: string }

plan:
  # custom step: baseline lint before refinement
  baseline_lint: |
    Run eslint baseline; record pre-existing issues in ### Plan.
  
  explore: |
    [replaces default — focus discovery on src/services/ + src/api/]
    Discover code patterns; ignore generated/ and dist/ directories.
  
  # rules: uses default
  
  refine: |
    [replaces default — adds custom AC style]
    Decompose into phases. Write each AC from user perspective:
    "As a [role], I can [action] so that [outcome]".

build:
  implement: |
    [replaces default — BDD methodology]
    Write Gherkin scenario, then step-defs, then implementation.
  
  task_check: |
    [extends default — adds metadata-preservation check]
    Also verify task.phase.fields are preserved on the phase block.
  
  code_check: |
    [extends default — adds console.log warning]
    Flag any new console.log calls as warn-severity findings.
  
  # custom step: run coverage tool, write to field
  coverage: |
    Run `pnpm test --coverage --json > /tmp/cov.json`.
    Extract percentage and store in $phase.field.coverage_pct.
  
  # custom step: auto-commit per phase
  commit: |
    `git add -A && git commit -m "feat($TASK_SLUG): $PHASE_NAME"`.
    Store SHA in $phase.field.commit.

wrap:
  # review: uses default (/review skill)
  
  # custom step: create PR
  create_pr: |
    Run `gh pr create --fill --body-file ./.anchored/pr-body.md`.
    Capture the PR URL and store in $phase.field.pr_url for each
    completed phase.
  
  # summarize: uses default
  
  # custom step: sync to Jira
  sync_jira: |
    Read all phase summaries from ### Wrap. Update Jira ticket
    via `jira-cli transition $TASK_SLUG -t Done` (Jira ID is
    derived from task slug convention).
```

This is the maximum surface user can touch in V0.2: 3 schema field
declarations + 11 step customizations (mix of replace, extend, and
new custom steps).

---

## References

- [anchored-yml-defaults.md](./anchored-yml-defaults.md) — framework defaults
- [task-file-schema-spec.md](./task-file-schema-spec.md) — task-file core schema
- [service-layer-architecture.md](./service-layer-architecture.md) — typed core + generic field ops
- [skill-orchestration.md](./skill-orchestration.md) — agent/skill orchestration
