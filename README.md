<div align="center">

<img src="./assets/og-image.png" alt="anchored — long autonomous AI coding runs you can actually trust. Every claim has proof. Every step configurable." width="100%">

<br>

[![license](https://img.shields.io/badge/license-MIT-2dd4bf)](./LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-38bdf8)](https://github.com/chafoo/anchored)
[![version](https://img.shields.io/badge/version-0.4.0-2dd4bf)](https://github.com/chafoo/anchored/releases)

</div>

> **Configure long, autonomous AI runs — `plan → refine → build → wrap`, on epics or tasks — with anchored evidence at every step.**

Shape each step of your work — your tests, commits, gates, your tools — and anchor
evidence to every implementation. With anchored, an AI can run for hours and you still
trust the result: nothing reaches *done* without the proof to back it.

Same lifecycle at every scale — **epic ▸ task ▸ phase**. CLI-only, zero-install plugin, no MCP.

## What ships here

| Package | Distributed as | Role |
|---|---|---|
| [`plugin/`](./plugin) | Claude Code marketplace plugin (`anchored`) | Skills, agents, references — what users install. Bundles its own CLI; zero setup. |
| [`core/`](./core) | npm package (`@chaafoo/anchored`) | The factory engine + `anchored` CLI — schema, state machine, atomic writes, and the evidence invariant. |

The plugin ships the user-facing skills (`/a:plan` · `/a:refine` · `/a:build` ·
`/a:wrap` · `/a:setup`) and agents; the core package ships the deterministic engine
they drive over the CLI. **No MCP** — one transport, the `anchored` CLI over Bash,
identical in the main session *and* in subagents/headless.

User-facing docs: [`plugin/README.md`](./plugin/README.md) · engine internals:
[`core/README.md`](./core/README.md).

## Repo layout

```
anchored/
├── plugin/                  # Claude Code marketplace target
│   ├── .claude-plugin/      # plugin manifest
│   ├── bin/                 # the bundled `anchored` CLI — on PATH automatically, zero-install
│   ├── default-template/    # the anchored.default.yml sidecar
│   ├── skills/              # /a:plan · /a:refine · /a:build · /a:wrap · /a:setup
│   ├── agents/              # 16 stage-bucketed subagents
│   └── references/          # on-demand docs the skills + agents load
│
├── core/                    # npm package: @chaafoo/anchored
│   └── src/
│       ├── lib/             # the contracts + the error primitive
│       ├── modules/         # shared schema fragments + the tier factories (phase · task · epic)
│       ├── services/        # the dumb store (fs · lock · yaml seams) + the template service
│       ├── cli/             # createCli — the one assembly point + the two-token dispatch
│       └── bin.ts           # the published CLI entry
│
└── docs/                    # the docs hub — CLI api · tier · stage portraits
```

## Quick start

In Claude Code:

```
/plugin marketplace add chafoo/anchored
/plugin install anchored@chafoo
```

Then in any project:

```
/a:plan <describe an epic, a task, or a phase>   # the tier is an argument of plan
/a:refine <slug>                                  # ground the plan + Q&A walk + gates
/a:build <slug>                                   # implement + verify, phase by phase
/a:wrap <slug>                                     # review + summary (+ epic roll-up)
```

The CLI ships **inside** the plugin — Claude Code puts `plugin/bin/` on PATH for
you, in the main session and in subagents. No `npm i -g`, no MCP setup.

## Docs

The docs hub is **[`docs/`](./docs/_docs.md)**:

- **[CLI API](./docs/api.md)** — every `anchored <tier> <verb> [slug]` command and the `/a:*` skills
- **[Tier portraits](./docs/tier/_tier.md)** — epic · task · phase, and what each one is for
- **[Lifecycle stages](./docs/stages/_stages.md)** — setup · plan · refine · build · wrap

## Contribute

```bash
git clone https://github.com/chafoo/anchored
cd anchored/core
bun install
bun run test     # the spec-coverage gate + unit + e2e + int suites
bun run build    # tsc → dist/ (Node-compatible artifact)
```

The non-negotiable principles are in [`CLAUDE.md`](./CLAUDE.md).

## Status

Pre-1.0 — the v3 architecture is built and dogfood-validated; APIs may still shift.
Tier model `epic ▸ task ▸ phase`, plugin namespace `a`. `@chaafoo/anchored` is not
yet on npm (the plugin bundles the CLI, so users don't need it published).

## License

MIT — see [LICENSE](./LICENSE).

---

Built by [@chafoo](https://github.com/chafoo).
