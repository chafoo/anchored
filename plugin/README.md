# anchored

> Evidence-anchored task lifecycle for Claude Code.

`/impl-plan` → `/impl-build` → `/impl-wrap`. Every acceptance criterion
in your task requires concrete, verifiable evidence (file:line,
command output, test result) before the framework will mark it done.
No more agents hallucinating done-ness.

## Install

```
/plugin install anchored
```

That's it. The MCP server (`@anchored/mcp`) is fetched via `npx` on
first use; no manual MCP config.

## Quickstart (3 steps)

**1. Plan your task.** In any project:

```
/impl-plan add OAuth 2.0 device flow to the API
```

On first use in a new project, anchored offers to set up `anchored.yml`
with framework defaults. Say yes. The plan agent then writes a
`.claude/tasks/<slug>.md` file with phases, testable acceptance
criteria, and surfaces any open questions for you to resolve.

**2. Build it.** When the task status is `build`:

```
/impl-build
```

anchored loops through pending phases: implements each, verifies
evidence honesty (`task-validate` agent), checks rule adherence
(`code-validate` agent), commits per phase if you've configured it.
Resume-safe after crashes or compaction — just re-run `/impl-build`.

**3. Wrap up.** When all phases are terminal:

```
/impl-wrap
```

Runs Claude Code's built-in `/review`, writes a TL;DR summary to the
task-file, marks task as done.

**Or just `/impl`** to run all three sequentially as an autopilot.

## What's in the box

- 4 slash-commands: `/impl-plan`, `/impl-build`, `/impl-wrap`, `/impl`
- 5 anchored-shipped agents: `plan`, `rules`, `implement`,
  `task-validate`, `code-validate`
- 1 MCP server with ~9 typed tools for state mutations
  (no agent edits the task-file directly — all routed through the
  service-layer)
- 1 CLI for shell-side scripting in your `anchored.yml` `run:` hooks

## Updating a plan

You can revisit a plan anytime — discuss, tweak, or restructure:

**Discuss** ("Why does phase 2 have 5 ACs? Can we split it?") — just
chat with the AI about the plan; no mutations happen unless you ask.

**Small tweak** ("Add an AC about input validation to phase 1") — the
AI applies the change via MCP ops and logs an audit entry to
`context.plan`.

**Restructure** ("Let's re-approach this — group by domain instead of
by layer") — the AI spawns plan-agent with your request, presents a
diff, applies it after you confirm.

Invoke via `/impl-plan` on a task that's past `status: plan`. The
skill detects the existing file and branches into update-mode.

After any update-mode edit, the task status flips BACK to `drafted`
so `/impl-refine` re-validates the modified plan against current
code + rules before the next `/impl-build` attempt.

**Done phases are protected.** If you ask to remove or restructure a
phase that's already `status: done` with proven evidence, anchored
asks for explicit per-phase confirmation before discarding that
evidence (the factory throws `DonePhaseImmutable` if the prompt is
skipped — the friendly prompt and the service-layer safety net
agree).

## Configuration

Everything customizable via `anchored.yml` at your project root. The
file ships empty (tsconfig-style) — uncomment + edit only the slots
you want to change. See `references/default-config.yml` for the full
slot list with inline documentation.

The framework is methodology-agnostic by default — pick TDD, BDD,
code-first, or roll your own per project.

### What you can extend

- `plan.steps[]` — the `/impl-plan` pipeline (default: explore →
  rules → refine).
- `refine.steps[]` — additional steps run AFTER plan-check +
  rules-check during `/impl-refine`.
- `refine.plan_check.instructions` — prose appended to plan-check's
  default brief (e.g. project-specific architecture preferences).
- `refine.rules_check.instructions` — prose appended to rules-check.
- `build.steps[]` — the `/impl-build` per-phase pipeline (default:
  implement; user adds coverage / commit / etc.).
- `build.task_validate.instructions` — prose appended to
  task-validate.
- `build.code_validate.instructions` — prose appended to
  code-validate.
- `build.retry_limit` — caps the failures-driven re-do loop (default
  3).
- `wrap.steps[]` — the `/impl-wrap` pipeline (default: review →
  summarize).
- `task.phase.fields[]` — custom phase-level fields (e.g. commit
  SHA, coverage %).

### What you cannot disable

Anchored ships **4 always-on quality gates**, none of which can be
turned off:

| Gate            | Skill           | Purpose                                              |
|-----------------|-----------------|------------------------------------------------------|
| `plan-check`    | `/impl-refine`  | Drift between plan and current code; surface gaps    |
| `rules-check`   | `/impl-refine`  | Rules-coverage per phase; cross-phase rule conflicts |
| `task-validate` | `/impl-build`   | Evidence honesty per AC; no done-without-proof       |
| `code-validate` | `/impl-build`   | Rules adherence in implemented code                  |

All four are extensible via their `<gate>.instructions:` slot in
`anchored.yml` (prose appended to the framework default brief).
None are disable-able by design — they are the framework's USP.

### VCS integration

Anchored is VCS-agnostic. There is no `build.commit` slot. To
auto-commit per phase (or push, tag, open a PR), add a custom step
under `build.steps[]` running your VCS of choice. See the inline
example in `references/default-config.yml`.

## IDE setup — live YAML validation

Task-files (`.claude/tasks/<slug>.yml`) and `anchored.yml` ship with
JSON Schemas that any modern editor can validate against in real time.
Errors appear inline (red squigglies) as you edit, before anchored
ever reads the file.

**It works out of the box** — files generated by `/impl-plan` and the
default `anchored.yml` already include a `yaml-language-server`
directive on line 1, pointing at the published schema. No config
needed; just install a YAML language server in your editor.

| Editor             | What to install                                                            |
|--------------------|----------------------------------------------------------------------------|
| **VSCode**         | [Red Hat "YAML" extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) (the standard YAML LSP) |
| **JetBrains IDEs** | Built in — enable the YAML plugin if it isn't already                      |
| **Neovim**         | `yaml-language-server` via [mason.nvim](https://github.com/williamboman/mason.nvim) or your LSP installer |
| **Helix**          | `yaml-language-server` — included in default config                        |
| **Emacs**          | `yaml-language-server` via `lsp-mode` / `eglot`                            |
| **Zed**            | YAML language server enabled by default                                    |

**Manually adding the directive** (if you have existing files that
don't have it):

For a task-file (`.claude/tasks/<slug>.yml`):
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/chafoo/anchored/main/plugin/references/schema/task-file-v2.schema.json
schema_version: 2
slug: ...
```

For `anchored.yml`:
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/chafoo/anchored/main/plugin/references/schema/anchored-yml.schema.json
task:
  phase:
    fields: []
```

Both schema URLs are versioned by the path in this repo, so future
breaking schema changes will publish at a new path (e.g.
`/schema/v3/`). The current v2 path holds across additive schema
evolutions.

## Learn more

- `references/task-file-schema.md` — task-file format spec
- `references/state-mutations.md` — MCP tool reference
