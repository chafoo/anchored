# @chaafoo/anchored-mcp

> MCP server + CLI for [anchored](https://github.com/chafoo/anchored) —
> the Claude Code plugin for long autonomous AI coding runs.

The typed service layer behind the `anchored` Claude Code plugin. Ships
two binaries sharing the same core:

- **`anchored-mcp`** — MCP server. Exposes 37 typed tools for task-file
  mutations to Claude Code subagents during `/impl-*` skills.
- **`anchored`** — CLI. Same operations as shell commands for scripting
  in `anchored.yml` `run:` hooks.

Most users won't install this directly — `/plugin install anchored`
pulls it via `npx`. This README covers standalone use (CI hooks,
custom MCP clients, scripting).

## Install

```bash
npm install -g @chaafoo/anchored-mcp
```

Or via npx (zero-install):

```bash
npx -y @chaafoo/anchored-mcp
```

Requirements: Node 20+

## Use as an MCP server

In any MCP-compatible client:

```json
{
  "mcpServers": {
    "anchored": {
      "command": "npx",
      "args": ["-y", "@chaafoo/anchored-mcp"]
    }
  }
}
```

The server is designed to back the anchored Claude Code plugin — its
tools mutate task-files (`.claude/tasks/<slug>.yml`) according to the
anchored lifecycle. For general AI coding use, install the plugin via
the Claude Code marketplace.

## Use as a CLI

The `anchored` CLI mirrors the MCP tool surface as shell commands:

```bash
# Read a task
anchored task read <slug>

# Mutate phase state
anchored phase status set <slug> <phase> done

# Set evidence for an acceptance criterion
anchored ac evidence set <slug> <phase> <ac-index> "src/foo.ts:42 — works"

# Add a structured question
anchored task question add <slug> --text "Toggle UX?" --priority medium --origin plan-agent

# Record an autonomous build-time decision (stop-check 'proceed')
anchored task question resolve <slug> <id> --answer "..." --source ai --reasoning "within plan"
```

Useful inside `anchored.yml` step hooks — e.g. capture commit SHA per
phase:

```yaml
build:
  steps:
    - name: commit
      run: |
        git add -A && git commit -m "phase: ${PHASE_SLUG}"
        SHA=$(git rev-parse HEAD)
        anchored field set "${TASK_SLUG}" "${PHASE_SLUG}" commit "$SHA"
```

Run `anchored --help` for the full command tree.

## Tool surface

37 typed MCP tools (matching CLI subcommands) for evidence-anchored
task-file mutations, grouped by domain:

| Domain       | Operations                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| **task**     | create, read, status, title                                                |
| **context**  | intro, plan, build / wrap sub-sections                                     |
| **phase**    | list, next, add, remove, move, status, name, context, rules, retry counter |
| **ac**       | add, remove, text, evidence (set/add), failures (set/clear), status        |
| **field**    | list, set, get (custom phase fields per anchored.yml)                      |
| **question** | add, list, resolve, retag (priority-tagged Q&A surface)                    |

## Guarantees

Every mutation goes through a typed service layer that:

- **Validates** against the task-file schema (Zod) — at the op boundary
  and again before any write
- **Atomic write** via temp + rename — never leaves partial files on disk
- **Cross-process safe** via file-lock with retry (3× 100ms backoff)
- **State-machine enforced** — illegal transitions throw typed errors
- **Round-trip preserves** user extensions (custom phase fields, custom sections)

No agent can "forget" to set evidence, no malformed phase blocks slip
through, no silent corruption.

## Status

Alpha. Architecture landed and ran end-to-end dogfood (see tag
[`v0.3-dogfood-pass`](https://github.com/chafoo/anchored/releases/tag/v0.3-dogfood-pass)).
Not yet published to npm — pending namespace claim + initial release.

## License

MIT — see [LICENSE](./LICENSE).
