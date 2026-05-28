# Changelog

All notable changes to anchored (the Claude Code plugin) and
`@chaafoo/anchored-mcp` (the underlying MCP server + CLI) are
documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [0.1.1] — 2026-05-28

### Fixed

- `mcp/package.json` had duplicate keys (`keywords`, `license`,
  `repository`) from a botched merge. The duplicate `repository`
  carried the wrong URL (`anchored/anchored` instead of
  `chafoo/anchored`), which npm normalized into the published
  metadata for 0.1.0. Removed the duplicates; canonical
  `repository: chafoo/anchored` is the single source of truth now.

### Changed

- CI publish workflow (`.github/workflows/publish.yml`) switched
  from `NODE_AUTH_TOKEN` to npm trusted publishing via OIDC. No
  long-lived tokens; each release is authenticated by GitHub's
  short-lived id-token signed against the workflow + repository
  registered with npm. Removes the supply-chain attack surface
  from stolen registry tokens.

## [0.1.0] — 2026-05-28

Initial public release.

### Added

- **5 SKILLs orchestrating the full lifecycle.** `/impl-plan` →
  `/impl-refine` → `/impl-build` → `/impl-wrap`, plus `/impl` as
  autopilot that chains all four. Each SKILL is resume-safe across
  crashes and context compaction.
- **Evidence-anchored acceptance criteria.** No AC flips to `done`
  without concrete proof (file:line, command output, test results).
  Stops AI from hallucinating done-ness — the framework's USP.
- **Priority-tagged Q&A.** Every ambiguity surfaced during planning
  becomes a structured question tagged `low | medium | high` (by
  impact, not difficulty). Stored in the task-file with full audit
  (`source`, `reasoning`, timestamps).
- **Autonomy declaration.** First stage of `/impl-refine`: user picks
  how autonomous the run should be:
  - `ask_all` — walk every question with the user
  - `ask_high_only` — AI handles routine, user handles important
  - `decide_all` — full autopilot, reasoning recorded for review
- **Four mandatory quality gates.** `plan-check` + `rules-check` in
  refine (parallel), `task-validate` + `code-validate` in build (per
  phase, parallel). All four extensible via `instructions:` in
  `anchored.yml`; none can be disabled.
- **Failures-driven re-do loop.** Validators write failures per AC;
  implement re-spawns reading them; bounded by `build.retry_limit`
  (default 3). Retry behavior branches on autonomy level.
- **Per-phase rules.** Rules from `.claude/rules/*.md` get attached
  to phases based on affected paths + content. rules-check verifies
  coverage before build.
- **Configurable orchestration via `anchored.yml`.** Custom steps
  per stage (per-phase commits, deploy hooks, custom validators,
  PR creation, notify integrations). The file ships empty with
  inline-documented defaults.
- **6-state task lifecycle.** `plan → drafted → refined → build →
  wrap → done` with strict transitions. Update-mode allows backward
  jumps to `drafted` for plan changes.
- **Pair-programmer voice.** Skills + agents speak like a partner,
  not an automation engine — machinery details (Stage numbers, MCP
  tool names, factory internals) stay out of chat.
- **Atomic schema-validated task-file mutations.** All writes go
  through `@chaafoo/anchored-mcp` factory ops with Zod validation,
  state-machine enforcement, and cross-process locking
  (`proper-lockfile`).
- **YAML hardening.** 1MB document cap, alias-count limit
  (billion-laughs guard), no custom tags. Yaml-language-server
  directive auto-injected on every write for IDE schema validation.

### Architecture

- SKILLs (running in the main Claude session) own all task-file
  mutations via MCP. Plugin custom subagents return structured
  output; SKILLs apply via `mcp__task__*` calls. Works around
  Anthropic claude-code [#13605](https://github.com/anthropics/claude-code/issues/13605)
  (plugin subagents can't access MCP tools).
- `@chaafoo/anchored-mcp` MCP server exposes 38 tools across task,
  question, autonomy, phase, AC, context, and field surfaces.
- CLI mirror (`anchored ...`) for manual inspection + scripting.

### Known limitations

- **Plugin-defined subagents currently cannot directly call MCP
  tools** — confirmed across Anthropic claude-code issues
  [#13605](https://github.com/anthropics/claude-code/issues/13605),
  [#21560](https://github.com/anthropics/claude-code/issues/21560),
  [#33689](https://github.com/anthropics/claude-code/issues/33689),
  [#15810](https://github.com/anthropics/claude-code/issues/15810).
  anchored handles this transparently — agents return structured
  output, SKILLs apply via MCP. Same audit trail, same outcome.
  When upstream fixes it, agents will use MCP directly without code
  changes here.
