# Power-user anchored.yml setups (advisory reference)

A consultation resource for the `/setup` skill — the distilled, language-
agnostic shape of a strong `anchored.yml`. **Read this only when the user
asks for advice** ("what do you recommend?", "how should I set this up?")
or to back a single proportional suggestion. It is NOT a checklist to walk
the user through and NOT a setup to install wholesale. Recommend the piece
that fits what the user is doing; skip the rest.

The one universal baseline that always applies: **every custom step carries
`name` + `instructions`** (the config documents itself). Everything below is
optional and situational.

---

## The four extension surfaces (where things go)

- **Custom step** (`*.steps[]`) — a `run:` shell command or a `use:` worker
  (`type: agent|skill`). Runs in declaration order after the stage's
  default work.
- **Phase field** (`task.phase.fields[]`) — a typed slot every phase
  carries (e.g. `commit` SHA, `coverage_pct`).
- **Gate instructions** (`…​.instructions`) — prose appended to a built-in
  gate's prompt (plan_check, rules_check, implement, task_validate,
  code_validate, stop_check). Extends, never replaces.
- **Global stop-conditions** (`build.stop`) — natural-language rules; the
  autonomous build halts back to the user on the first match.

## Mechanism fit (how to pick run vs use)

- `run:` → **deterministic shell**. Guards, lint/build, commit, PR. Exits
  non-zero to halt the stage.
- `use: …, type: agent` → **isolated judgment / heavy work** in a subagent
  (spec-fidelity gate, security review, a rule-writer). Cannot see the
  session; feed it everything via `instructions` + the task context.
- `use: …, type: skill` → a **multi-step, in-session workflow** that needs
  the live context (e.g. a doc-sync skill). Runs in the orchestrator's
  session — only for skills safe to drive headlessly.

---

## Tiered recommendations

### Tier 0 — hygiene (fits almost any project)

- **Branch guard** (`build.steps`, `run`): refuse to build-commit on the
  default branch; force a feature branch.
- **Phase = commit** (`build.steps` `run` + a `commit` phase field):
  commit each phase and record the SHA → clean history + a diff range later
  steps can scope to.
- **Deterministic floor** (`build.steps`, `run`, after implement): the
  project's "compiles + lints + formatted" command. Non-zero halts the
  phase. Keeps the judgment gates from re-deriving mechanical violations.
- **Open a PR on wrap** (`wrap.steps`, `run`, if a remote exists).

```yaml
build:
  steps:
    - name: guard
      run: |
        [ "$(git branch --show-current)" = "main" ] && {
          echo "Switch to a feature branch first"; exit 1; }
      instructions: Refuse to build-commit on main — anchored has no pre-build hook.
    - name: lint
      run: "<the project's lint+typecheck/build command>"
      instructions: Deterministic floor (lint + type/compile). Non-zero halts the phase.
    - name: commit
      run: |
        git add -A && git commit -m "feat(${TASK_SLUG}): ${PHASE_NAME}"
        anchored field set ${TASK_SLUG} ${PHASE_SLUG} commit "$(git rev-parse HEAD)"
      instructions: Phase = one commit; record the SHA into the commit phase field.
```

### Tier 1 — methodology (gate `instructions` only, no new steps)

- `implement.instructions` → your methodology (TDD/BDD), architectural
  patterns, code conventions, language rules.
- `task_validate.instructions` → the evidence bar: concrete `file:line`,
  real test-run output, commit refs — no "should work".
- `code_validate.instructions` → **scope** it: what it checks, and what is
  delegated elsewhere (so it doesn't duplicate the lint floor or a spec
  gate).
- `plan_check` / `rules_check.instructions` → architecture + rule-coverage
  preferences.

### Tier 2 — stop-conditions (`build.stop`)

Keep it short and meaningful. Common additions beyond the shipped default
(`a decision deviates from the plan`): "a change touches anything outside
the project root", "the docs/spec conflict with the ticket scope".

### Tier 3 — custom judgment workers (`use: agent` in `build.steps`)

Extend the two built-in gates with project-specific judgment: a
spec-fidelity gate, a security gate, a performance gate. Each is a
`use: <agent>, type: agent` step with `instructions` defining its verdict
contract (and what halts the phase).

### Tier 4 — wrap = capture + ship

Turn the built code back into durable artifacts and ship it: sync docs
from the real code, extract lived conventions into rules, review the diff
with inline comments + a fix-task, commit the doc/rule changes, open the
PR. A mix of `use: skill` (multi-step in-session workflows) and
`use: agent` (isolated reviewers) + `run` (commit/PR).

---

## The four disciplines that separate power setups from beginner ones

1. **One job per step/gate, zero overlap.** Carve responsibilities
   explicitly (e.g. code_validate says "don't check spec — that's the spec
   gate; don't re-run lint — that's the lint step"). This is the big one.
2. **Deterministic in `run`, judgment in gate-`instructions`/`use:agent`.**
   Never make an LLM gate recompute mechanical lint/type errors.
3. **Scope discipline.** Steps act on the task's changed paths (derived
   from the phase `commit` SHAs), not the whole repo.
4. **Self-documenting config.** `name` + `instructions` on every custom
   step.

## The only language-specific part

Just the "floor" and the test runner vary. Ask the user's toolchain and
fill in:

| Language    | Floor (lint + type/compile)    | Tests        |
| ----------- | ------------------------------ | ------------ |
| JS / TS     | `eslint` + `tsc` (+ prettier)  | vitest/jest  |
| Rust        | `cargo clippy` + `cargo build` | `cargo test` |
| Go          | `golangci-lint` + `go vet`     | `go test`    |
| Python      | `ruff` + `mypy`                | `pytest`     |
| Java/Kotlin | `gradle check`                 | test task    |

Everything else — branch guard, phase=commit, Conventional Commits,
`gh pr create`, the gate methodology slots, stop-conditions — is
language-independent.
