# @anchored/mcp

MCP server and CLI for the [anchored](https://github.com/anchored/anchored)
Claude Code plugin.

This package provides two binaries that share a common service-layer:

- **`anchored-mcp`** — MCP server exposing typed task-file mutations as
  tools (called by Claude Code subagents during `/impl-*` skills).
- **`anchored`** — CLI for the same operations, intended for shell-side
  scripting in your `anchored.yml` `run:` hooks.

## Install

Normally installed automatically when you install the anchored plugin:

```
/plugin install anchored
```

For standalone CLI use (e.g. in shell scripts or CI):

```
npm install -g @anchored/mcp
```

## Usage

### As MCP server (automatic via plugin)

The anchored plugin's `.mcp.json` references this package via
`npx -y @anchored/mcp`. Claude Code starts the server as a managed
subprocess on `/plugin install anchored`; no manual config.

### As CLI (manual scripting)

```bash
# Read a task
anchored task read <slug>

# Mutate phase state
anchored phase status set <slug> <phase> done

# Set evidence for an acceptance criterion
anchored ac evidence set <slug> <phase> <index> "src/foo.ts:42 — works"

# Append notes to a Context sub-section
anchored context append <slug> Build Implement "switched to fastify.register"

# Set a user-declared phase field
anchored phase field set <slug> <phase> commit abc1234
```

Run `anchored --help` for the full command tree.

## What it does

Every mutation goes through a typed service-layer that:
- Validates against the task-file schema (Zod-based)
- Enforces legal state-machine transitions
- Round-trip-preserves user extensions (`task.phase.fields`, custom sections)
- Renders cleanly to Markdown (line-based regex parser, no AST)

This is what gives anchored its USP: no agent can "forget" to set evidence,
no malformed phase blocks slip through, no silent state corruption.

## Requirements

- Node 20+

## License

MIT
