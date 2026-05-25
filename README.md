# anchored — monorepo

Evidence-anchored task lifecycle for Claude Code. This repo houses two
deployable targets that ship together but publish separately:

```
anchored/
├── plugin/   →  Claude Code marketplace as "anchored"
├── mcp/      →  npm as "@anchored/mcp" (MCP server + CLI)
└── docs/     →  architecture + design specs
```

## What is anchored?

A Claude Code plugin that takes raw task descriptions through a structured
`plan → build → wrap` lifecycle where every acceptance criterion requires
**concrete, verifiable evidence** (file:line refs, command output, test
results) before the framework marks it done. Stops AI agents from
hallucinating done-ness.

User-facing docs live in [plugin/README.md](./plugin/README.md).

## Repo structure

### [`plugin/`](./plugin/) — what users install

- `.claude-plugin/plugin.json` — plugin manifest (name, description, author)
- `.mcp.json` — declares the MCP server via `npx -y @anchored/mcp`
- `skills/` — the 4 slash-commands (`/impl-plan`, `/impl-build`, `/impl-wrap`, `/impl`)
- `agents/` — 5 anchored-shipped subagents
- `references/` — on-demand docs the agents read
- `examples/` — sample anchored.yml configs and a finished task-file

### [`mcp/`](./mcp/) — the npm package (server + CLI)

- `src/schema/` — Zod schemas for `anchored.yml` and the task-file
- `src/parser/` — task-file ↔ data-structure (round-trip safe)
- `src/ops/` — typed service-layer operations (core + generic field ops)
- `src/cli/` — `anchored` CLI binary
- `src/mcp/` — `anchored-mcp` MCP server binary
- Built with esbuild, bundled to single-file outputs.

### [`docs/`](./docs/) — design specs and architecture

Detailed design decisions, schema specs, agent contracts, and the V0.2
execution roadmap. Read these to understand WHY things are structured
the way they are.

## Development

```bash
# Build everything
cd mcp && npm install && npm run build

# Run tests
npm test

# Type-check without emit
npm run typecheck
```

## Versioning

Single version aligns across both deployables. `V0.2.0` is the first
marketplace release. Pre-release tags (`-alpha.N`, `-beta.N`) for
early testing.

## License

MIT — see [LICENSE](./LICENSE).
