# CLAUDE.md — anchored v2

anchored v2 is a **fractal rewrite** of anchored. The complete design is the
binding spec — **read `docs/design/` first**, before you touch code or docs:

- `docs/design/fractal-lifecycle.md` — the tier model (project▸epic▸task▸phase,
  all `plan→refine→build→wrap`; `build.each` = recursion; `phase` = leaf).
- `docs/design/engine-architecture.md` — the factory-function engine.
- `docs/design/anchored.default.yml` — the complete default config.
- `docs/design/file-structure.md` — the authoritative file structure (docs + build
  follow it).
- `docs/design/fractal-redesign-notes.md` — decision record (all items).

## Non-negotiable principles

1. **Fractal**: one lifecycle form on every tier. `build.each: <tier>` is
   intrinsic (not configurable). `phase` is the leaf (build without `each`).
2. **No built-ins** — everything is a step. The opinionated behaviour lives in the
   default template (`anchored.default.yml`), active by default, overridable.
3. **Integrity in the substrate — and ONLY that**: no `ac` to `done` without
   `evidence`. Enforced in the data model (`services/store/invariants/invariants.ts`),
   NOT in a step. **The evidence invariant is the one and only thing we enforce
   programmatically — we secure the _proof_, never the _work_.** Cutting
   ceremony / wall-clock comes from better **CLI-API ergonomics** + leaner **skill
   orchestration**, **never** from new built-ins, engine "smarts", or baked-in
   automation. **Git stays the user's** — the engine never runs git for you;
   branch/commit/merge are config/skill policy, not mechanism. When a fix is
   tempting, ask: does it add enforcement of work, or just make the existing
   substrate easier to drive? Only the latter is allowed.
4. **CLI-only transport**: all ops through the `anchored` CLI via Bash. **No MCP.**
   Works in the main session AND subagents/headless. The CLI emits JSON.
5. **Factory functions**: `createX(cfg, deps) → { run(input) → output }`,
   helpers in `scope/`. The engine is deterministic code; AI is an effect behind
   `spawn` (default: `claude -p` per task-file, phases in-process).
6. **anchored.yml = base dependency**: `merge(default-template, user)` once at
   bootstrap, injected as `deps.config`.
7. **Mechanism vs. policy**: engine/substrate/transitions/invariant = code;
   fields + step sequences = config/template.

## Plugin / commands

- Plugin namespace **`a`** (fallback `anc`). Commands are skills:
  `/a:plan <tier?> <input>` · `/a:refine <slug>` · `/a:build <slug>` ·
  `/a:wrap <slug>`. No separate tier entries — the tier is an argument of `plan`.
- Agents: flat in `plugin/agents/`, stage-prefix buckets. **Never** name an agent
  `plan` or `explore` (Claude Code reserved agent types).

## Build order

1. **pure-engine** — factory engine + substrate. The v3 tree is `lib/` (contracts ·
   utils · constants) → `modules/<tier>` (pure condition bundles) → `services/`
   (generic store + config) → `cli/` (the orchestrator). See `docs/design/v3/`.
2. **default-template** — `anchored.default.yml` as the merged base; all default
   steps as template workers.
3. **epic-tier** — epic as a tier (scaffold/walk/loop/roll-up), nested slugs,
   classify.

## Languages

- **Code = English** — identifiers, comments, commit messages, everything in code.
- **Docs = English** — `docs/`, the plugin (`plugin/**/*.md`: skills, agents,
  references), READMEs. One language for everything that ships.
- **Plugin chat = the plugin user's language** — what anchored writes into the user
  chat at runtime (skills/agents) mirrors the plugin user's language; never
  hardcoded to one language (see `plugin/references/communication-style.md`,
  "match the project's prevailing language"). German is **not** privileged here.
- **Our working language = German** — the conversation in **this** main instance,
  while developing anchored, is in German. That is separate from the plugin chat
  and applies only to us here. Technical terms and code identifiers stay in their
  original form.

**No abbreviations in the docs.** Jargon acronyms are spelled out:
`just-in-time` instead of JIT, `fan-out` / `dependency graph` instead of DAG,
`summary` instead of TL;DR, `acceptance criterion` / `acceptance criteria` instead
of AC (in prose; code identifiers like `add-ac` stay), `version-control` instead
of VCS, `test-driven development` instead of TDD. Established proper names stay
(CLI, JSON, YAML, MCP, AI, PR, HTML/CSS/DOM, UI/UX, SHA).

## Conventions

- Code reads like the surrounding code (comment density, naming, idiom).
- Quality gates per package (lint/format/typecheck/test/build) — the tooling choice
  is fixed in `pure-engine`.
