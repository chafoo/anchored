<div align="center">

<img src="./assets/og-image.png" alt="anchored — long autonomous AI coding runs you can actually trust. Every claim has proof. Every step configurable." width="100%">

<br>

[![npm](https://img.shields.io/npm/v/@chaafoo/anchored-mcp?color=2dd4bf&label=%40chaafoo%2Fanchored-mcp&logo=npm)](https://www.npmjs.com/package/@chaafoo/anchored-mcp)
[![license](https://img.shields.io/badge/license-MIT-2dd4bf)](./LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-38bdf8)](https://github.com/chafoo/anchored)

</div>

> **Long autonomous AI coding runs you can actually trust.**
> Every claim has proof. Every decision is on the record. Every step is configurable.

Evidence-anchored task lifecycle for Claude Code — every acceptance
criterion needs concrete proof before the framework will mark it done.
Stops AI from claiming done before it actually is.

## What ships here

| Package | Distributed as | Role |
|---|---|---|
| [`plugin/`](./plugin) | Claude Code marketplace plugin (`anchored`) | Skills, agents, references — what users install |
| [`mcp/`](./mcp) | npm package (`@chaafoo/anchored-mcp`) | MCP server + CLI — typed service layer behind the plugin |

The plugin ships the user-facing skills, agents, and reference docs.
The npm package ships the MCP server those agents call. They publish
separately but co-evolve in this repo.

User-facing docs: [`plugin/README.md`](./plugin/README.md).

## Repo layout

```
anchored/
├── plugin/                       # Claude Code marketplace target
│   ├── .claude-plugin/           # plugin manifest
│   ├── .mcp.json                 # references @chaafoo/anchored-mcp via npx
│   ├── skills/                   # /impl-plan, /impl-refine, /impl-build, /impl-wrap, /impl
│   ├── agents/                   # 7 specialized subagents
│   └── references/               # on-demand docs the agents load
│
├── mcp/                          # npm package: @chaafoo/anchored-mcp
│   ├── src/schema/               # Zod schemas (task-file + anchored.yml)
│   ├── src/core/                 # createOps(config, root) factory
│   ├── src/cli/                  # `anchored` CLI binary
│   ├── src/mcp/                  # `anchored-mcp` MCP server binary
│   └── tests/                    # 484 tests across 36 files
│
└── docs/                         # architecture + design specs
```

## Contribute

```bash
git clone https://github.com/chafoo/anchored
cd anchored/mcp
npm install
npm test       # 484 tests
npm run build  # produces dist/cli/bin.js + dist/mcp/server.js
```

Plugin development is symlink-based — point your project's `.claude/`
folders at this repo's `plugin/` subdirectories and edits propagate
live. No build step.

See [`docs/`](./docs) for architecture specs (service layer, skill
orchestration, agent design).

## Status

Live. [`@chaafoo/anchored-mcp`](https://www.npmjs.com/package/@chaafoo/anchored-mcp)
is on npm and the plugin installs from the marketplace today:

```
/plugin marketplace add chafoo/anchored
/plugin install anchored@chafoo
```

Community-marketplace review (`claude-community`) is in progress.
Pre-1.0 — APIs may still shift; feedback shapes the roadmap.

## License

MIT — see [LICENSE](./LICENSE).
