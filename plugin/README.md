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
evidence honesty (`task-check` agent), checks rule adherence
(`code-check` agent), commits per phase if you've configured it.
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
  `task-check`, `code-check`
- 1 MCP server with ~9 typed tools for state mutations
  (no agent edits the task-file directly — all routed through the
  service-layer)
- 1 CLI for shell-side scripting in your `anchored.yml` `run:` hooks

## Configuration

Everything customizable via `anchored.yml` at your project root.
See `references/default-config.yml` for the full schema, or
`examples/anchored-yml-power-user.yml` for a maximalist example.

The framework is methodology-agnostic by default — pick TDD, BDD,
code-first, or roll your own per project.

## Learn more

- `references/task-file-schema.md` — task-file format spec
- `references/state-mutations.md` — MCP tool reference
- `examples/sample-task-finished.md` — what a completed task looks like
