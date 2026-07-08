# Rule: CLI-only Transport — no MCP

> Scope: CLI, plugin skills, the validator agent, every run-file mutation.
> Non-negotiable.

## The Rule

**All reads and writes on a run file go through the `anchored` CLI, invoked
via Bash.** No MCP. One transport, one mental model — works in the main
session AND in subagents/headless/CI alike. A CLI-over-Bash behaves
effectively like a CC built-in.

## Always

- **The 9 flat verbs** — `anchored anchor · claim · amend · validate ·
  evidence · fail · set · status · close`. `validate` returns the validation
  packet (criteria, snapshot, setup instructions) — **the CLI never spawns;
  the skill does**.
- **CLI outputs JSON only** — one envelope `{ ok, command, result | error }`
  per call, machine-parsable for skills + agents.
- **The validator reads + writes directly via CLI** — `anchored evidence` /
  `anchored fail` are the only ways a criterion changes proof state.
- **Init adds `Bash(anchored *)`** to `.claude/settings.local.json`, so calls
  run through without a prompt.

## Never

- **No MCP server, no MCP tools.** MCP-in-subagents is broken; Bash is the
  only ubiquitous tool.
- **No raw `Write`/`Edit` on `.claude/anchored/*.yml`** while a run is live —
  all mutations go through the validating CLI (otherwise you bypass the
  evidence invariant + atomic writes). Manual editing during pure
  design/planning is unaffected.

## Why

CI-/headless-capable, a single transport model, no subagent MCP bugs. The
core (schema, invariant, atomic writes) stays the value — transport-agnostic
behind the CLI.

## Reference

`docs/design/north-star.md` (naming + CLI verbs). [[factory-functions]],
[[substrate-integrity]].
