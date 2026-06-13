# Rule: CLI-only Transport — no MCP

> Scope: CLI, plugin skills, all agents, every ops mutation. Non-negotiable.

## The Rule

**All ops run through the `anchored` CLI, invoked via Bash.** No MCP.
One transport, one mental model — works in the main session AND in
subagents/headless alike. A CLI-over-Bash behaves effectively like
a CC built-in.

## Always

- **Mutations + reads go through `anchored <verb>`** — stage verbs
  (`plan`/`refine`/`build`/`wrap`) drive the engine; generic node verbs
  (read/set-status/add-evidence/log …) drive the ops.
- **CLI outputs JSON** — structured, machine-parsable, for skills + agents.
- **Agents read + write directly via CLI** — no more pure-thinker workaround
  (that was a v1 MCP bug workaround). The agent calls `anchored …` over Bash.
- **lazy-init** adds `Bash(anchored *)` to `.claude/settings.local.json`, so that
  the calls run through without a prompt.

## Never

- **No MCP server, no MCP tools.** MCP-in-subagents is broken (#13605, no
  fix); CC built-ins aren't extensible for plugins. Bash is the only
  ubiquitous tool.
- **No raw `Write`/`Edit` on task-files / `_epic.yml`** during engine operation —
  all mutations go through the validating CLI (otherwise you bypass the invariant +
  atomic-write). (Manual editing during the design/planning phase is unaffected by
  this.)

## Why

CI-/headless-capable, a single transport model, no subagent MCP bugs. The
core factory (schema, state machine, atomic-writes, invariant) remains the value —
just transport-agnostic behind the CLI. See
`docs/design/fractal-redesign-notes.md` → "Transport: CLI-over-Bash".

## Reference

`docs/design/file-structure.md` (cli/), `docs/design/fractal-redesign-notes.md`.
[[factory-functions]], [[fractal-substrate-integrity]].
