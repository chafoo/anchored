---
slug: repo-layout
status: draft
created: 2026-05-25
---

# Repo layout — marketplace-ready plugin structure

Sketch of the full anchored plugin layout, following Claude Code plugin
conventions. Each entry has an inline comment explaining what it is and
who reads/writes it.

This is the **shape we're building toward** for V0.2 ship — not all
files exist yet. Use as the source-of-truth map for "where does X go".

---

## Full tree

# ══════════════════════════════════════════════════════════════════════════
# Architecture: TWO repositories
# ══════════════════════════════════════════════════════════════════════════
# Based on how published Claude plugins ship (context7, feature-dev,
# frontend-design): plugins themselves stay LEAN — just SKILL.md, agents,
# and a thin .mcp.json that points to an npm-published binary.
#
# Anchored ships as:
#   Repo 1: `anchored-plugin`       → goes into Claude marketplace
#   Repo 2: `anchored-mcp` (npm)    → MCP server + CLI, separate npm package
#
# This matches context7's pattern: the plugin is tiny, the MCP server is
# a separate npm package referenced via `npx -y @anchored/mcp`.

# ──────────────────────────────────────────────────────────────────────────
# Repo 1: anchored-plugin (the marketplace package)
# ──────────────────────────────────────────────────────────────────────────

anchored-plugin/                                     # plugin root
│
├── .claude-plugin/
│   └── plugin.json                                  # plugin manifest (CONFIRMED format):
│                                                    #   { name, description, author: {name, email} }
│                                                    #   Minimal — no version/mcpServers fields needed.
│
├── .mcp.json                                        # MCP server registration (CONFIRMED format,
│                                                    # see context7):
│                                                    #   { "anchored": {
│                                                    #       "command": "npx",
│                                                    #       "args": ["-y", "@anchored/mcp"]
│                                                    #     }
│                                                    #   }
│                                                    # Claude Code reads this on /plugin install,
│                                                    # auto-registers + starts the MCP server.
│
├── LICENSE                                          # MIT
├── README.md                                        # user-facing readme — quickstart, examples
│
├── skills/                                          # CONFIRMED pattern (see frontend-design).
│   │                                                #   each folder = one slash-command.
│   ├── impl-plan/
│   │   └── SKILL.md                                 # orchestrator manual for /impl-plan.
│   ├── impl-build/
│   │   └── SKILL.md
│   ├── impl-wrap/
│   │   └── SKILL.md
│   └── impl/
│       └── SKILL.md                                 # autopilot: composes plan→build→wrap.
│
├── agents/                                          # CONFIRMED pattern at plugin root
│   │                                                # (see feature-dev's agents/ folder).
│   ├── rules.md
│   ├── plan.md
│   ├── implement.md
│   ├── task-check.md                                # FIXED quality gate
│   └── code-check.md                                # FIXED quality gate
│
├── references/                                      # on-demand docs for agents.
│   │                                                # not part of Claude's standard plugin layout
│   │                                                # but accepted convention (referenced from
│   │                                                # SKILL.md / agent files).
│   ├── task-file-schema.md
│   ├── default-config.yml                           # framework default anchored.yml.
│   │                                                #   copied into user projects on first use
│   │                                                #   (lazy init — see Onboarding below).
│   ├── evidence-format.md
│   └── state-mutations.md
│
└── examples/                                        # showcase materials (non-runnable).
    ├── sample-task-finished.md
    ├── anchored-yml-minimal.yml
    └── anchored-yml-power-user.yml

# ──────────────────────────────────────────────────────────────────────────
# Repo 2: anchored-mcp (npm package — MCP server + CLI binary)
# ──────────────────────────────────────────────────────────────────────────

anchored-mcp/                                        # npm package root
│                                                    # published as @anchored/mcp on npm.
│
├── package.json                                     # npm manifest. exposes:
│                                                    #   "bin": {
│                                                    #     "anchored-mcp": "./dist/mcp/server.js",
│                                                    #     "anchored": "./dist/cli/bin.js"
│                                                    #   }
│                                                    #   "engines": { "node": ">=20" }
├── tsconfig.json
├── README.md                                        # npm-page readme
├── LICENSE
│
├── src/                                             # TypeScript source.
│   ├── schema/                                      # Zod schemas (single source of validation).
│   │   ├── anchored-yml.ts
│   │   └── task-file.ts
│   │
│   ├── parser/                                      # task-file ↔ data-structure.
│   │   ├── parse.ts                                 # MD → typed datastructure
│   │   └── render.ts                                # typed → MD (round-trip-safe)
│   │
│   ├── ops/                                         # service-layer (the heart).
│   │   ├── core.ts                                  # typed core ops
│   │   ├── field.ts                                 # generic field ops (schema-driven)
│   │   └── validate.ts                              # state-machine validation
│   │
│   ├── cli/                                         # `anchored` CLI binary
│   │   ├── bin.ts                                   # entry point (shebang)
│   │   └── commands/
│   │       ├── phase.ts                             # `anchored phase status set ...`
│   │       ├── ac.ts
│   │       ├── context.ts
│   │       └── field.ts
│   │
│   └── mcp/                                         # MCP server (`anchored-mcp` binary).
│       ├── server.ts                                # entry point.
│       │                                            #   Started by Claude Code via npx -y when
│       │                                            #   plugin is installed.
│       └── tools/                                   # one file per MCP tool.
│           ├── task-read.ts                         # mcp__anchored__task_read
│           ├── task-status-set.ts
│           ├── phase-next-pending.ts
│           ├── phase-status-set.ts
│           ├── phase-field-set.ts
│           ├── phase-field-get.ts
│           ├── ac-evidence-set.ts
│           ├── ac-list.ts
│           └── context-append.ts
│
├── tests/                                           # unit + integration tests.
│   ├── parser.test.ts
│   ├── ops-core.test.ts
│   └── mcp-integration.test.ts
│
└── dist/                                            # compiled output (gitignored, published).
    ├── cli/bin.js
    └── mcp/server.js
```

# ══════════════════════════════════════════════════════════════════════════
# Why two repos?
# ══════════════════════════════════════════════════════════════════════════

This is the pattern context7 uses. Plugin stays tiny (just declarative
config + SKILL.md + agents), MCP server lives independently on npm.
Benefits:

- **User install is `/plugin install anchored`** — Claude Code reads
  `.mcp.json`, runs `npx -y @anchored/mcp` which fetches from npm,
  caches, runs. Zero manual config.
- **MCP server updates without plugin update** — bump npm version,
  users get it via `npx -y` (which fetches latest matching version).
- **CLI same binary as MCP** — both compile from same `src/`, ship
  in same npm package. Users who want shell scripting get
  `anchored` CLI via `npm install -g @anchored/mcp` if needed.
- **Plugin repo small** — easy to review, easy to fork, easy to
  understand for users browsing the marketplace.

---

## Key design decisions baked into this layout

### Agents at root (`agents/`), not per-skill

All four skills share the same five agents. Putting them at the root
(instead of `skills/impl-plan/agents/`) means no duplication and
future skills can reuse the same agents without moving files.

Matches Claude Code's project-local `~/.claude/agents/` convention.

### References at root (`references/`), not per-skill

Same reasoning. `task-file-schema.md` is read by plan-agent during
/impl-plan AND by implement-agent during /impl-build AND by code-check
during /impl-build. Shared location, single source of truth.

### `src/cli/` AND `src/mcp/` both shipped

Two frontends for one service-layer:
- **CLI** for user scripting + shell hooks (`run:` steps in anchored.yml)
- **MCP** for agents (typed tools, no string-parsing of bash output)

Both are thin wrappers around `src/ops/`. Implementation lives once.

### `dist/` is the shipped artifact

Plugin manifest points to `./dist/mcp/server.js` for MCP and
`./dist/cli/bin.js` for CLI. Source TypeScript is for development;
distribution is pre-bundled. Users don't install `node_modules` for
anchored.

### MCP server registration is declarative

Plugin manifest contains:

```json
{
  "mcpServers": {
    "anchored": {
      "command": "node",
      "args": ["./dist/mcp/server.js"]
    }
  }
}
```

Claude Code reads this on `/plugin install anchored`, registers the
server, starts it as managed subprocess. **User never edits
`.mcp.json`** — this is the Claude way: declarative install, zero
manual config.

### Onboarding = lazy init on first /impl-plan in a project

Plugin install is GLOBAL (one-time per Claude Code session). But
`anchored.yml` is PER-PROJECT — different projects use different
configs. So plugin-install can't auto-create the file in any specific
project.

Better pattern: **first /impl-plan in a project triggers setup.**

```
$ cd my-project
$ # in Claude Code: /impl-plan "add OAuth"

→ Claude (in /impl-plan orchestrator):
  "I don't see an anchored.yml here. I'll create one with the
   framework defaults — you can edit it later. Continue?"
   [Y/n]
→ Y
→ Creates anchored.yml from references/default-config.yml.
→ Creates .claude/tasks/ folder.
→ Proceeds with /impl-plan normally.
```

Single user-touchpoint, no separate `anchored init` step. Works because
the orchestrator already runs Pre-flight checks (it's reading config
anyway). Adding "create if missing" is one extra branch in the
orchestrator's logic, zero UX cost.

Video tutorial / deeper onboarding comes later. For V0.2 ship: this
lazy-init is enough.

---

## What's intentionally NOT in the layout

- **No per-skill `scripts/`** — none of the skills need bespoke scripts
  that don't fit into the shared `src/cli/` or `src/mcp/`. If a real
  use-case emerges in V0.3, we add `skills/<name>/scripts/`.
- **No per-skill `agents/`** — see "agents at root" above.
- **No `assets/`** — anchored doesn't ship images/icons/non-code assets
  in V0.2. The marketplace listing image (if needed) lives in
  `.claude-plugin/`.
- **No `eval-viewer/`** — skill-creator has an HTML eval viewer for
  visualizing benchmark runs. Nice-to-have, not V0.2-blocker.
- **No worktree/** — V0.2 doesn't manage git worktrees. Future feature.

---

## Status per directory (V0.2 build progress)

| Directory             | Status  | Notes                                          |
|-----------------------|---------|------------------------------------------------|
| `.claude-plugin/`     | ❌ TBD  | needs marketplace.json format research         |
| `README.md`           | ❌ TBD  | write last, after structure is settled         |
| `skills/impl-*/`      | ❌ TBD  | write SKILL.md per skill (4 files)             |
| `agents/`             | ❌ TBD  | write 5 agent prompts (plan first)             |
| `references/`         | 🟡 part | task-file-schema.md exists in V0.1, port + extend|
| `src/schema/`         | ❌ TBD  | Zod schemas                                    |
| `src/parser/`         | ❌ TBD  | port sb-bot's progress.ts logic                |
| `src/ops/`            | ❌ TBD  | implement typed core + generic field ops       |
| `src/cli/`            | ❌ TBD  | bin + commands                                 |
| `src/mcp/`            | ❌ TBD  | server + tool exposures                        |
| `evals/`              | 🟡 part | V0.1 has evals.json for /refine, port + expand |
| `examples/`           | ❌ TBD  | nice-to-have, write after agents work          |
| `tests/`              | ❌ TBD  | unit tests for service-layer                   |
| `dist/`               | n/a     | build artifact                                 |

---

## Settled (researched from real Claude plugins)

1. **Plugin-manifest format** ✓ — `.claude-plugin/plugin.json` with
   `{ name, description, author: { name, email } }`. Minimal. No
   "marketplace.json" — that's separate (marketplace-level, not
   plugin-level).

2. **MCP server distribution** ✓ — separate npm package `@anchored/mcp`,
   referenced via `.mcp.json` with `npx -y @anchored/mcp`. No bundling
   into plugin. Matches context7 pattern.

3. **CLI distribution** ✓ — same npm package as MCP server. `package.json`
   declares both as `bin` entries (`anchored-mcp` + `anchored`).
   Users who want CLI scripting do `npm install -g @anchored/mcp`.

4. **Node version target** ✓ — `engines: { node: ">=20" }`. Node 20 is
   widely available (Claude Code itself assumes it).

5. **Versioning** — npm semver. V0.2.0 first stable release. Pre-release
   tags (V0.2.0-alpha.1, -beta.1) for early testing via `npm install
   @anchored/mcp@alpha`. Plugin's `.mcp.json` can pin a major version
   (`@anchored/mcp@^0.2`) to lock breaking-change boundaries.

## Open — implementation-time decisions

- **Bundle strategy for `dist/`** — esbuild is the standard choice for
  Node/TS CLIs + servers. Fast, single-file output, no runtime deps.
  Vote: esbuild for both CLI and MCP.
- **Mono-package or split?** — V0.2 ships ONE npm package with two `bin`
  entries (`anchored-mcp` + `anchored`). Splitting into separate npm
  packages would add complexity for no clear win in V0.2.

## References

- [skill-naming.md](./skill-naming.md)
- [skill-orchestration.md](./skill-orchestration.md)
- [default-agents.md](./default-agents.md)
- [task-file-schema-spec.md](./task-file-schema-spec.md)
- [service-layer-architecture.md](./service-layer-architecture.md)
- [anchored-yml-defaults.md](./anchored-yml-defaults.md)
- [anchored-yml-customs.md](./anchored-yml-customs.md)
