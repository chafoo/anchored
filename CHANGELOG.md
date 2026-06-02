# Changelog

All notable changes to anchored (the Claude Code plugin) and
`@chaafoo/anchored-mcp` (the underlying MCP server + CLI) are
documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] — 2026-06-02

### Added

- **`/setup` skill — a conversational `anchored.yml` configuration
  assistant.** Auto-triggers whenever the user wants to create, change, or
  extend their `anchored.yml` (add a step, wire an agent/skill into a
  stage, tune a gate, set up commit/PR/TDD automation) — even without
  naming the file. It translates the user's stated requirements into
  correct, schema-valid config, writes `name` + `instructions` on every
  custom step, and validates before finishing. It clarifies genuine
  ambiguities with the user and advises on request (backed by
  `plugin/references/power-user-setups.md`), but never pushes a setup the
  user didn't ask for — no power-user onboarding funnel.
- **Custom steps gain `instructions` (any step) + `type` (use steps), and
  `use:` dispatch is now real.** A lifecycle step
  (`plan`/`refine`/`build`/`wrap`.`steps`) can now declare:
  - `instructions:` — free-prose documentation of what the step does and
    why, allowed on **any** step. The recommended base for every custom
    step is `name` + `instructions`. On a `run:` step it self-documents
    the shell (rationale + audit trail); on a `use:` step it is
    additionally threaded into the invoked worker, the step-level analogue
    of the reserved slots' `instructions` (`build.implement.instructions`,
    …).
  - `type: agent | skill` — on a `use:` step, picks the invocation
    mechanism. `agent` (the default when omitted; back-compatible with
    existing `use: anchored/implement` steps) spawns an **isolated
    subagent** via the Agent tool; `skill` invokes the worker via the
    Skill tool **in the orchestrator's own session**. Rejected on a `run:`
    step (no worker to type).
  - A single canonical dispatch contract
    (`plugin/references/step-dispatch.md`) replaces the previously
    unspecified "invoke the named tool … depending on how the user has
    wired it" hand-wave; all four lifecycle skills now point at it.
  - See `plugin/EXTENDING.md` → "Add a custom step to any stage".

### Changed

- **Decluttered the shipped `default-config.yml`** — dropped the decorative
  `# ─── stage ───` divider headers and the redundant schema line; the
  inline per-slot explanations stay. Cosmetic; no shape change.

## [0.2.0] — 2026-06-02

### Added

- **Dynamic Workflow executor — optional per-phase fan-out for
  `/impl-build`.** A phase can opt into `executor: workflow` (default,
  field-absent, stays `implement` — byte-identical to before) to run as
  a Claude Code Dynamic Workflow: its acceptance criteria fan out across
  parallel unit-workers (≤16 concurrent / 1000 total) instead of one
  sequential `implement` agent.
  - New phase field `executor: implement | workflow` (schema +
    `RESERVED_FIELD_NAMES`), a `phase.executor.set` op, the
    `task__set_phase_executor` MCP tool, and the
    `anchored phase executor set <slug> <phase-slug> <executor>` CLI.
  - New `workflow` agent: a fan-out unit-worker with the inverse
    write-contract — it writes its own evidence/failures to the
    task-file via the `anchored` CLI (invoked as
    `npx -y -p @chaafoo/anchored-mcp anchored …`, the same
    package-resolution that loads the MCP server — no global install or
    PATH entry needed).
  - `/impl-build` feature-detects the Workflow runtime and **falls back
    to the sequential `implement` path** when it is unavailable — never
    a hard error. The `task-validate` + `code-validate` gates run **once
    over the merged phase result**, and the failures-driven retry loop /
    retry-limit are unchanged.
  - See `plugin/EXTENDING.md` → "Running phases as a Dynamic Workflow"
    (incl. the CLI allowlist note for background workflows).
- **Behavioral eval suite (`evals/`).** An LLM-in-the-loop harness for
  the lifecycle skills (plan / refine / build / wrap), with per-stage
  task-file fixtures reusable as seeds.

### Changed

- **Build autonomy reworked from persisted levels to ephemeral
  walk-style + global stop-conditions.** The persisted `task.autonomy`
  field (`ask_all` / `ask_high_only` / `decide_all`) is gone. In its
  place:
  - `/impl-refine` Stage 0 now picks an **ephemeral walk-style**
    (AI-all / high-together / all-together) that governs only that
    one Q&A walk — it is never written to the task-file. `/impl-build`
    runs the same ephemeral walk to clear any still-open questions
    before its run (open-question detection is programmatic).
  - `/impl-build` runs **maximally autonomous** over emergent
    build-time decisions: retry → decide → document via
    `question_resolve(source='ai', reasoning)`. It halts ONLY when an
    emergent decision matches a rule in `anchored.yml.build.stop`
    (shipped default: a single rule, `'a decision deviates from the
    plan'`), judged by the new `stop-check` evaluator + the implement
    worker's own self-report (double safety net). The old three-way
    autonomy branch in the failures loop is removed.
  - `/impl-wrap` now surfaces every `source='ai'` resolution with its
    reasoning, grouped by phase, as a decisions review.
- **MCP tool surface: 38 typed tools.** Net of this release: the
  `task.autonomy` op was removed (build-autonomy rework) and
  `task__set_phase_executor` was added (workflow executor). Old on-disk
  task-files carrying a top-level `autonomy:` key still load — the
  parser silently drops the legacy field.

### Fixed

- **Rule-file discovery no longer silently skips underscore-prefixed
  directories.** The `rules` + `rules-check` agents relied on a
  recursive glob (`.claude/rules/**` / `**/*.md`) that can return zero
  files when rules live under `_concern/` / `_pattern/`, making an agent
  report "no rules exist" and drop all rule-coverage. Both now fall back
  to `Grep` / explicit subdir globbing before concluding the folder is
  empty.
- **`/impl-build` flips `refined → build` at entry.** The forward-only
  state machine made the terminal `build → wrap` transition illegal when
  the task was left at `refined`; the flip now happens up front.

## [0.1.3] — 2026-05-28

### Fixed

- MCP server reported itself as `v0.2.0` regardless of the published
  package version — a stale hardcoded string in `src/mcp/server.ts`
  left over from the V0.2 era. Server now reads its version from
  `package.json` at startup via `createRequire`, so the
  `serverInfo.version` advertised to MCP clients and the
  `anchored-mcp v<X> ready` startup line stay in sync with the
  published version automatically. No more manual sync on release.

## [0.1.2] — 2026-05-28

First successful npm publish via CI. (0.1.1 tagged but never reached
npm registry due to npm CLI bundled with Node 20 not handling
trusted-publisher OIDC reliably.)

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
- CI now pins Node 22 (npm 11.x) and upgrades npm to latest before
  publish — npm 10.x's trusted-publisher implementation had
  intermittent registry-auth bugs.

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
