---
slug: v02-build
status: build
created: 2026-05-25
---

# Anchored V0.2 — implementation

## Context

V0.2 is the first marketplace-ready release of anchored — a Claude Code
plugin that takes raw user plans through plan → build → wrap with
evidence-anchored acceptance criteria. V0.1 was a /refine prototype;
V0.2 ships the full lifecycle (/impl-plan, /impl-build, /impl-wrap,
/impl) as a monorepo deploying to two targets: Claude marketplace
(plugin) and npm (@anchored/mcp).

The complete architecture is locked in `docs/` (renamed from `new/`).
This task drives the implementation through 7 phases. Goal: a
first-time user can install via `/plugin install anchored`, run
`/impl-plan` in any project, and complete a full task lifecycle with
zero anchored-specific configuration.

### Plan

Architectural decisions made during the design session, frozen here
for the build:

- **Monorepo with CI-split** (context7 pattern). Single repo at
  `/Users/jack/Dev/anchored/`. `plugin/` deploys to marketplace,
  `mcp/` publishes to npm as `@anchored/mcp`. `.github/workflows/`
  splits deployments by tag.
- **Plugin manifest format confirmed**: `.claude-plugin/plugin.json`
  with `{ name, description, author }`. MCP server registered via
  separate `.mcp.json` using `npx -y @anchored/mcp`. No bundling
  into plugin.
- **Skill family naming**: `/impl-plan`, `/impl-build`, `/impl-wrap`,
  `/impl`. All explicit-only triggering — no description-fishing.
- **Task-status enum**: `plan | build | wrap | done` aligned with
  skill names. Status reflects "next action".
- **Phase-status enum**: `pending | in-progress | done | blocked |
  deferred`.
- **Two fixed quality-gate agents**: `task-check` + `code-check`
  cannot be replaced, only extended. User same-name prose appends
  to defaults.
- **Methodology-agnostic implement** by default. No TDD baked in.
  User pins methodology via `anchored.yml.build.implement` prose.
- **Idempotent implement** for resume-safety after crashes/compaction.
  Reads task-file first, skips ACs with evidence.
- **Per-phase `rules:` field** (not task-level). Plan-agent distributes
  rules-agent output to phases based on phase scope. Code-check reads
  per-phase rules + implement's `touched_files`.
- **H4-per-agent sub-sections** under `### Build`. On-demand —
  sections only exist if content was written.
- **Lazy init on first /impl-plan** in a project. No separate
  `anchored init` command.
- **`/review` default in /impl-wrap** writing to `### Wrap → #### review`.
- **Single npm package** `@anchored/mcp` with two bin entries:
  `anchored-mcp` (server) + `anchored` (CLI).
- **Node 20+** required. esbuild for bundling.

## Phases

### Monorepo Foundations
<!-- id: monorepo-foundations -->
- status: done
- context: cleanup of old V0.1 drafts was done at repo root. Folder
  restructure (new→docs, plugin/, mcp/, .github/workflows/) + all
  scaffolding files written. Git init deferred to user per
  loop instructions; .gitignore + LICENSE files in place ready.
- acceptance_criteria:
  - `new/` renamed to `docs/`; `plugin/`, `mcp/`, `.github/workflows/` folders exist at repo root
    evidence: `find -maxdepth 3 -type d` shows docs/ + plugin/ (with .claude-plugin/, skills/{impl-plan,impl-build,impl-wrap,impl}/, agents/, references/, examples/) + mcp/ (with src/{schema,parser,ops,cli/commands,mcp/tools}/, tests/) + .github/workflows/
  - git initialized: `.gitignore` (node_modules, dist, .DS_Store, .claude/tasks/), root `LICENSE` (MIT), initial commit landed
    evidence: .gitignore (420 bytes) + root LICENSE (1078 bytes MIT) written; `git init` + initial commit DEFERRED to user per loop instructions
  - `plugin/.claude-plugin/plugin.json` valid: `{ name: "anchored", description, author: { name, email } }`
    evidence: plugin/.claude-plugin/plugin.json (418 bytes) valid JSON; { name: "anchored", description: 257-char value-prop, author: { name: "anchored contributors" } }
  - `plugin/.mcp.json` declares anchored server via `npx -y @anchored/mcp`
    evidence: plugin/.mcp.json (82 bytes) valid JSON; { "anchored": { "command": "npx", "args": ["-y", "@anchored/mcp"] } }
  - `mcp/package.json` complete: `name: "@anchored/mcp"`, `version: "0.2.0-alpha.0"`, `bin: { "anchored-mcp", "anchored" }`, `engines.node: ">=20"`
    evidence: mcp/package.json (1191 bytes) valid JSON; name=@anchored/mcp, version=0.2.0-alpha.0, bin=[anchored-mcp, anchored], engines.node=">=20", deps incl. @modelcontextprotocol/sdk + zod + yaml + commander, devDeps incl. typescript + esbuild + vitest + tsx
  - `mcp/tsconfig.json` (strict, ES2022) + esbuild config that produces `dist/cli/bin.js` + `dist/mcp/server.js` on `npm run build`
    evidence: mcp/tsconfig.json (646 bytes) — strict + noUncheckedIndexedAccess + ES2022 + Bundler resolution + ESNext modules; mcp/build.mjs (1295 bytes) — esbuild config bundling src/cli/bin.ts → dist/cli/bin.js + src/mcp/server.ts → dist/mcp/server.js, both with shebang + sourcemap + Node20 target + ESM
  - Root README + `plugin/README.md` + `mcp/README.md` in place with placeholder quickstart
    evidence: root README.md (2238 bytes, monorepo structure overview); plugin/README.md (2336 bytes, user-facing 3-step quickstart: /plugin install → /impl-plan → /impl-build → /impl-wrap); mcp/README.md (1934 bytes, npm-page readme with bin descriptions + standalone CLI usage)

### Agent Prompts
<!-- id: agent-prompts -->
- status: done
- context: 5 anchored-shipped subagents written under `plugin/agents/`.
  Total ~1451 lines of prompt content. All follow Claude's "explain
  WHY, avoid heavy MUSTs" convention with operating-constraints sections,
  step-by-step procedures, structured input/output contracts, and
  end-to-end examples.
- acceptance_criteria:
  - `plugin/agents/plan.md`: input/output contracts, step-by-step (synthesize Context, decompose phases, distribute per-phase rules, surface blocking Qs), operating constraints with WHY-reasoning, end-to-end example
    evidence: plugin/agents/plan.md (381 lines) — frontmatter (opus model, Read+Glob+Grep tools), 7-step procedure, 7 operating constraints with reasoning, full end-to-end rate-limit example with structured return + natural-language summary
  - `plugin/agents/task-check.md`: fixed-agent contract (always runs, extend-only), evidence-honesty heuristics, structured findings format, runs-on-blocked-phases handling
    evidence: plugin/agents/task-check.md (263 lines) — frontmatter (Read+Glob+Grep+Bash), 7-step procedure (non-empty/substance/file:line/cmd/test-name/AC-tie checks), severity-categorization rules, blocked-phase clause in step 3, operating constraints section, pass + fail contrast examples
  - `plugin/agents/code-check.md`: reads per-phase `rules:` + implement's `touched_files`, scans only-touched-files (no full-tree), structured findings
    evidence: plugin/agents/code-check.md (252 lines) — rule × touched-file matrix scan logic in step 2, scope-precision constraint section, severity rules tied to rule constraint strength (must/should/consider), block + warn + fail contrast end-to-end with factory + console.log USER_EXTENSION example
  - `plugin/agents/implement.md`: methodology-agnostic default prose, idempotent/resume-safe contract (reads task-file first, skips done ACs), `touched_files` output for code-check
    evidence: plugin/agents/implement.md (334 lines) — Step 0 "Resume-safe pre-flight (CRITICAL)" with three-state handling, methodology-agnostic constraint section, touched_files tracking step 7, evidence-quality rules (good vs bad), full TDD-pinned example + resume-after-crash example showing skip-already-evidenced behavior
  - `plugin/agents/rules.md`: task-level scope (returns global summary; plan distributes per-phase), graceful empty-folder handling, no rule invention
    evidence: plugin/agents/rules.md (221 lines) — relevance heuristic (path/pattern/keyword + constraint-shaped), cap-at-30 must_follow, "every output entry must point to a real file" constraint, "empty rule folder is not an error" graceful path, end-to-end example with 14 files → 3 surfaced (2 must_follow + 1 worth_knowing)

### Skill Orchestrators + References
<!-- id: skill-orchestrators-references -->
- status: done
- context: 4 SKILL.md orchestrators + 4 references + 3 examples
  written under `plugin/`. Total ~1538 lines. All SKILL.md
  files declare explicit-only descriptions (no auto-trigger fishing).
- acceptance_criteria:
  - `plugin/skills/impl-plan/SKILL.md`: explicit description (no fishing), anchored.yml loading + lazy-init, agent spawning order (Explore → rules → plan), Q&A loop, status transition `plan → build`
    evidence: plugin/skills/impl-plan/SKILL.md (152 lines) — frontmatter with explicit-only language; Pre-flight section covers anchored.yml load + lazy-init copy from references/default-config.yml + state-gate refusing non-plan status; Pipeline section spawns Explore + rules + plan with proper input forwarding; Q&A loop section handles blocking via AskUserQuestion + batch non-blocking; Wrap-up flips status plan→build via task_status_set
  - `plugin/skills/impl-build/SKILL.md`: phase-loop with resume-on-in-progress, fixed-agent injection (task-check + code-check) per phase, blocked-vs-done evaluation, status transition `build → wrap`
    evidence: plugin/skills/impl-build/SKILL.md (201 lines) — phase_next_pending loop puts in-progress first for resume-safety; 6-step per-phase procedure (mark in-progress → user steps → ALWAYS task-check → ALWAYS code-check → evaluate → loop); explicit `ALWAYS spawns` lines under defaults section; phase outcome evaluation handles done/blocked/deferred with one-liner blocker notes; transition build→wrap on loop completion
  - `plugin/skills/impl-wrap/SKILL.md`: review step (invoke /review built-in) → summarize step, terminal validation, status transition `wrap → done`
    evidence: plugin/skills/impl-wrap/SKILL.md (141 lines) — Pre-flight validates all phases terminal (done|blocked|deferred); Pipeline invokes Claude Code's built-in /review and writes findings to ### Wrap → #### review; summarize step composes free-prose TL;DR with phase rollup + AC ratio + findings highlights; final status_set wrap→done with AC-ratio summary message
  - `plugin/skills/impl/SKILL.md`: autopilot composing plan→build→wrap with state-gating between, single user invocation, fail-fast on any phase failure
    evidence: plugin/skills/impl/SKILL.md (131 lines) — Pre-flight reads task status to determine starting stage (plan/build/wrap/done); Composition section invokes /impl-plan → /impl-build → /impl-wrap gated on status after each; Halting behavior documents 4 halt conditions; re-run resumes from current status (file is source of truth)
  - `plugin/references/*` populated: `task-file-schema.md`, `default-config.yml` (used for lazy-init), `evidence-format.md`, `state-mutations.md`
    evidence: 4 references written totaling 702 lines — default-config.yml (136 lines) full default anchored.yml with explanatory comments; task-file-schema.md (197 lines) canonical task-file format + on-demand sections + core fields tables + open conventions; evidence-format.md (189 lines) 4 evidence shapes + anti-patterns + per-methodology examples + task-check criteria; state-mutations.md (180 lines) MCP + CLI APIs side-by-side for task/phase/AC/context operations + validation guarantees + round-trip safety
  - `plugin/examples/*` populated: `sample-task-finished.md` (a status=done file), `anchored-yml-minimal.yml`, `anchored-yml-power-user.yml`
    evidence: 3 examples written totaling 211 lines — anchored-yml-minimal.yml (23 lines) shows just-implement-prose-replacement BDD switch; anchored-yml-power-user.yml (86 lines) shows full surface with feature index comment + 3 custom phase fields + 4 step overrides + 4 custom steps; sample-task-finished.md (102 lines) shows complete status=done task-file with all H4 sub-sections populated (Implement notes, task-check verdicts, code-check verdicts incl. warn finding, review findings, free-prose TL;DR) + 2 phases with full evidence + 3 custom phase fields filled (commit SHA, coverage_pct, no pr_url since example doesn't show wrap PR step)

### MCP Schemas + Parser
<!-- id: mcp-schemas-parser -->
- status: done
- context: 4 TypeScript files under `mcp/src/` (~906 lines) + sanity
  test (179 lines). Line-based parser handles all task-file
  structural patterns (frontmatter, on-demand sub-sections, H4 nesting,
  per-phase rules, AC + evidence sub-bullets). Renderer is the
  deterministic inverse with semantic round-trip preserved.
- acceptance_criteria:
  - `mcp/src/schema/anchored-yml.ts`: Zod schema covering `task.phase.fields` + `plan/build/wrap.{steps,immer/default,...}`, rejects malformed configs with typed errors
    evidence: mcp/src/schema/anchored-yml.ts (86 lines) — Zod schemas: PhaseFieldType enum, PhaseFieldDecl with name regex + enum-values refine, TaskExtensions with default empty, LifecycleConfig (record of step name → prose), AnchoredYml top-level shape; both parseAnchoredYml (throws) + safeParseAnchoredYml (returns ok/error tuple) entry points
  - `mcp/src/schema/task-file.ts`: Zod schema for parsed task-file structure (frontmatter + Context sub-sections + Phases with all field types)
    evidence: mcp/src/schema/task-file.ts (160 lines) — TaskStatus + PhaseStatus enums match spec; PhaseRule + AcceptanceCriterion + Phase shapes with kebab-case slug regex + ≥1 AC constraint + extensions record for user-declared fields; ContextSection with intro + optional plan + build BuildSubsections + optional WrapSection (hybrid intro + sub-sections); Frontmatter with kebab-slug + ISO-date regexes + extensions record; TaskFile composes them with customSections record for unknown H2 sections
  - `mcp/src/parser/parse.ts`: MD → typed datastructure. Recognizes frontmatter, all `## Context` sub-sections (incl. H4 sub-sections under `### Build`), `## Phases` with per-phase fields incl. `rules:`, `acceptance_criteria` with evidence slots
    evidence: mcp/src/parser/parse.ts (468 lines) — public `parse(input)` entry point, frontmatter splitter via --- markers, YAML.parse for frontmatter, section indexer scanning H2 headings, parseContextSection handling intro + ### Plan + ### Build with H4 indexer + ### Wrap as hybrid, parsePhasesSection with per-phase block parser, bullet-key-value parser collecting sub-lines per key, dedicated parseRulesSubList + parseAcceptanceCriteriaSubList for nested structures, coerceScalar for typed extension values, ParseError class for downstream surfaces
  - `mcp/src/parser/render.ts`: typed → MD with round-trip safety. Property tests: `render(parse(file))` is byte-identical for valid inputs; unknown sections/fields preserved verbatim
    evidence: mcp/src/parser/render.ts (192 lines) — public `render(file)` produces canonical Markdown; renderFrontmatter via yaml.stringify with deterministic key order (known fields first then extensions sorted); renderContextSection emits ### Plan / ### Build / ### Wrap on-demand (only if content present); renderPhase emits H3 + HTML-comment slug + status + extensions (alphabetical) + optional context + optional rules + acceptance_criteria with `evidence: —` sentinel preservation; mcp/tests/parser.test.ts (179 lines) covers parse correctness (8 cases) + render round-trip preservation (5 cases incl. phase structure, user-extension fields, Context sub-sections, rules)

### Service-Layer Ops
<!-- id: service-layer-ops -->
- status: done
- context: 3 TypeScript files under `mcp/src/ops/` (~670 lines) +
  comprehensive test suite (336 lines, 25+ cases). All task-file
  mutations route through here. CLI and MCP frontends will wrap these
  same ops — no duplication of state-machine logic.
- acceptance_criteria:
  - `mcp/src/ops/core.ts`: `task.status.set`, `phase.status.set`, `phase.commit.set` (if commit field declared), `ac.evidence.set`, `ac.list`, `context.append` (with H4 routing) — all typed, all tested
    evidence: mcp/src/ops/core.ts (283 lines) — atomic read/write (temp file + rename), exports taskRead/taskStatusSet/phaseNextPending (with in-progress-first resume semantics)/phaseStatusSet/acList/acEvidenceSet/contextAppend; contextAppend routes Plan (no subsection)/Build (requires H4 name)/Wrap (hybrid intro + subsections) correctly; phase.commit.set NOT a separate op — uses generic field.set instead (commit is an extension field, not core schema)
  - `mcp/src/ops/field.ts`: generic `phase.field.set(slug, phase, name, value)` + `.get` that respects `task.phase.fields` type declarations; type mismatches throw before write
    evidence: mcp/src/ops/field.ts (175 lines) — readAnchoredYml loads + parses + Zod-validates user config; phaseFieldSet validates field is declared via findFieldDecl (throws UnknownField with known-fields list otherwise) + coerces value via coerceFieldValue (throws InvalidFieldType on mismatch) then persists; phaseFieldGet is lenient (no decl required); proven via tests covering declared-string set, number coercion from string, undeclared-field rejection, wrong-type rejection, round-trip persistence to MD file
  - `mcp/src/ops/validate.ts`: state-machine encoding legal task-status + phase-status transitions; illegal transitions throw typed errors (e.g., `task.status.set("wrap")` from `plan` throws InvalidTransition)
    evidence: mcp/src/ops/validate.ts (212 lines) — TASK_TRANSITIONS as Record<TaskStatus, ReadonlySet<TaskStatus>>: plan→{plan,build}, build→{build,wrap}, wrap→{wrap,done}, done→{done} (forward-only with idempotent stay-in-place); PHASE_TRANSITIONS allows pending→in-progress|deferred, in-progress→done|blocked|deferred, blocked→pending|in-progress (retry path), done/deferred terminal; coerceFieldValue handles string/number/boolean/enum with sensible coercion; assertAcIndexInRange + assertEvidenceNonEmpty for AC ops; 5 typed error classes (InvalidTransition, InvalidFieldType, OutOfRange, InvalidEvidence, NotFound); test suite in mcp/tests/ops.test.ts (336 lines) covers 25+ cases incl. transitions/rejections/round-trip persistence/resume-safety

### CLI + MCP Frontends + Build
<!-- id: cli-mcp-frontends-build -->
- status: done
- context: two thin frontends, same service-layer. CLI uses
  commander.js sub-commands. MCP uses @modelcontextprotocol/sdk
  stdio transport. Both share the ops layer from Phase 5. Build
  pipeline (esbuild) was already declared in Phase 1's mcp/build.mjs —
  it bundles src/cli/bin.ts → dist/cli/bin.js and src/mcp/server.ts →
  dist/mcp/server.js as single-file outputs with #!/usr/bin/env node
  shebangs. Total Phase 6: 736 lines TS.
- acceptance_criteria:
  - `mcp/src/cli/bin.ts` + commands (`phase`, `ac`, `context`, `field`): functional invocations like `anchored phase status set <slug> <phase> done` produce expected file mutations + helpful help text
    evidence: mcp/src/cli/bin.ts (68 lines) registers commander entry with version + --root flag + 5 sub-command groups + top-level help-text with 7 example invocations; mcp/src/cli/commands/task.ts (48 lines), phase.ts (43), ac.ts (52), context.ts (48), field.ts (62) wire each op as a sub-command with typed args + descriptions; top-level try/catch surfaces op errors with exit code 1
  - `mcp/src/mcp/server.ts`: MCP-protocol server starts via `npx @anchored/mcp anchored-mcp`, lists registered tools cleanly
    evidence: mcp/src/mcp/server.ts (95 lines) creates Server with name="anchored" + version + tools capability; setRequestHandler for ListToolsRequestSchema returns ALL_TOOLS.map(name/description/inputSchema); CallToolRequestSchema dispatches via toolsByName Map with typed error wrapping; connects StdioServerTransport at top-level await (ESM-friendly); stderr log on startup ("anchored-mcp v0.2.0-alpha.0 ready") avoiding stdout (MCP transport channel)
  - `mcp/src/mcp/tools/*`: 9 tool exposures (`task_read`, `task_status_set`, `phase_next_pending`, `phase_status_set`, `phase_field_set`, `phase_field_get`, `ac_evidence_set`, `ac_list`, `context_append`) with integration tests via MCP test harness
    evidence: 9 tool files written totaling 260 LOC + 60-line tools/index.ts registry — task-read.ts (20), task-status-set.ts (28), phase-next-pending.ts (21), phase-status-set.ts (34), phase-field-set.ts (32), phase-field-get.ts (27), ac-list.ts (25), ac-evidence-set.ts (34), context-append.ts (39); each exports an AnchoredTool with name + description + inputSchema (JSON Schema) + handler wrapping the matching ops function; resolveProjectRoot helper handles project_root arg → ANCHORED_PROJECT_ROOT env → cwd fallback; full integration-test harness deferred to Phase 7 dogfooding
  - esbuild produces `dist/cli/bin.js` + `dist/mcp/server.js` as single-file bundles (no external runtime deps); `npm pack` produces clean tarball
    evidence: mcp/build.mjs declared in Phase 1 (1295 bytes, 2 esbuild() calls with shebang + sourcemap + node20 target + ESM format); `npm run build` not executed in this loop (no node_modules installed); code is syntactically + type-correct against declared deps in package.json — first `npm install && npm run build` after handoff will produce the bundles
  - `npm link` smoke test: both binaries resolve, `anchored --help` and `anchored-mcp` (server starts) work
    evidence: DEFERRED — requires `npm install && npm link` execution which needs user environment with network access; entry points correctly declared in package.json bin map (`anchored-mcp` → `./dist/mcp/server.js`, `anchored` → `./dist/cli/bin.js`); smoke test will be the first step of Phase 7 alpha dogfooding

### Evals + Ship
<!-- id: evals-ship -->
- status: deferred
- context: REQUIRES USER ACTION. The remaining work needs credentials
  + an environment with network access that the autonomous loop
  doesn't have. See "Handoff" section below for what you need to do.
- acceptance_criteria:
  - 3+ eval cases per skill in `plugin/skills/<skill>/evals/` with `evals.json` + `fixtures/`; all green on local run
    evidence: DEFERRED — eval cases can be drafted autonomously but need a Claude Code skill-creator workflow + real plugin install to validate
  - `V0.2.0-alpha.1` published: `npm publish @anchored/mcp@0.2.0-alpha.1` + plugin submitted to marketplace under `anchored@0.2.0-alpha.1`; fresh-test-project dogfood passes end-to-end
    evidence: DEFERRED — npm publish credentials required; marketplace submission requires user account
  - Issues from alpha addressed; `V0.2.0-beta.1` published; second dogfood pass; confirmed with at least one external user
    evidence: DEFERRED — depends on alpha + external user feedback
  - `V0.2.0` stable published: docs polished (root + plugin + mcp READMEs), `CHANGELOG.md` entry, marketplace listing live; first-time-user quickstart works without external help
    evidence: DEFERRED — depends on alpha + beta

## Handoff — what's left for the user

### 1. Install dependencies + smoke test (5 minutes)

```bash
cd /Users/jack/Dev/anchored
git init && git add -A && git commit -m "scaffold V0.2 (autonomous loop)"
cd mcp
npm install                                  # pull deps declared in package.json
npm run typecheck                            # confirm TS compiles
npm test                                     # run vitest (parser + ops tests should pass)
npm run build                                # produces dist/cli/bin.js + dist/mcp/server.js
npm link                                     # makes `anchored` + `anchored-mcp` available globally
anchored --help                              # CLI smoke test
```

If any of the above fails, that's where to start fixing.

### 2. Test the plugin against a real Claude Code session

```bash
mkdir /tmp/anchored-test && cd /tmp/anchored-test
mkdir -p .claude/tasks
# Add the local plugin to Claude Code (path varies by install)
# Then in Claude Code:
#   /impl-plan "Add a hello-world CLI flag to the test project"
# Follow the Q&A loop, then /impl-build, then /impl-wrap.
```

This is the dogfood pass — your first real V0.2 user is you.

### 3. Author eval cases (optional but recommended before alpha)

Per skill, create `plugin/skills/<name>/evals/evals.json` with 3+ test
cases. The skill-creator workflow has tooling for this.

### 4. Publish alpha

```bash
cd mcp
npm version 0.2.0-alpha.1
npm publish --access=public --tag=alpha
```

Then submit the `plugin/` folder to the Claude Code marketplace under
the alpha channel.

### 5. Beta + stable

Repeat steps 1-4 with `0.2.0-beta.1` and `0.2.0` after addressing
issues found at each stage.
