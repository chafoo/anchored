# Changelog

All notable changes to anchored (the Claude Code plugin) and
`@chaafoo/anchored-mcp` (the underlying MCP server + CLI) are
documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-05-27

### Added

- **Priority-aware Q&A.** Every ambiguity surfaced during `/impl-plan`
  becomes a structured question tagged `low | medium | high` (by
  impact, not difficulty). Questions live in the task-file's
  `questions[]` array with full audit (`source`, `reasoning`,
  timestamps).
- **Autonomy declaration.** New mandatory stage in `/impl-refine`:
  user picks `ask_all` (walk every question), `ask_high_only` (AI
  decides routine, user decides important), or `decide_all` (full
  autopilot). Autonomy is a framework-fixed task field; overridable
  mid-run with audit entry.
- **Autonomy-aware failure handling in `/impl-build`.** Retry
  behavior branches on the autonomy level: `ask_all` blocks on first
  failure, `ask_high_only` retries then asks, `decide_all` retries
  then marks blocked and continues.
- **Mid-build question support.** `task-validate` and `code-validate`
  can surface new questions during build when they discover
  implementation ambiguity; these get `priority: high` and always
  ask the user regardless of autonomy.
- **Subagent MCP access via inline `mcpServers:` frontmatter**
  (replaces the user-scope `.mcp.json` workaround). Agents now talk
  to the MCP factory directly from their isolated session.

### Changed

- **plan-agent personality.** Brainstorm-only — no longer makes
  unilateral decisions for ambiguities, every gap becomes a structured
  question. Closes the six-unilateral-decisions failure mode from the
  V0.2 dogfood.
- **`/impl-plan` SKILL.** Drops the inline Q&A loop. Exits cleanly
  with status `drafted` and open questions intact, deferring resolution
  to `/impl-refine` where autonomy is declared first.
- **`/impl-refine` SKILL.** Restructured into 6 stages: autonomy
  declaration → plan-check + rules-check (parallel) → consolidated
  priority-aware Q&A walk → custom steps → status transition.
- **MCP tool surface.** 33 → 38 tools. Adds `task__set_autonomy`,
  `task__question_add`, `task__question_list`, `task__question_resolve`,
  `task__question_retag`. Legacy `task__resolve_question` (free-text
  marker resolve) retained for compatibility.
- **plan-check + rules-check.** Both gates now use structured
  `question_add` calls (priority-tagged) instead of inline `→ ?`
  markers. plan-check additionally scans plan-trail prose for hidden
  unilateral defaults (the V0.2 failure mode) and surfaces them as
  high-priority questions.
- **Communication style.** Pair-programmer voice across all 5 skills
  + 7 agents. Stage-N references, MCP tool names, and config slot
  identifiers explicitly forbidden in user-facing chat. Each skill
  ships with contrast pairs (machinery voice → partner voice).
- **Package rename.** `@anchored/mcp` → `@chaafoo/anchored-mcp`. The
  unscoped binary name `anchored-mcp` is now the package's primary
  bin, matching npx auto-resolution.

### Fixed

- Voice leakage where the orchestrator narrated dismissing TaskCreate
  reminders ("Reminder zur Kenntnis genommen — nicht anwendbar.").
  Explicit hard rule in all 5 SKILLs.

## [0.2.0] — 2026-05-26

### Added

- Initial public release of the V0.2 architecture: 6-state lifecycle
  (`plan → drafted → refined → build → wrap → done`), factory pattern
  for ops, mandatory quality gates, failures-driven retry loop,
  cross-process locking, YAML hardening.

See [git history](https://github.com/chafoo/anchored/commits/main)
for everything pre-0.3 in detail.
