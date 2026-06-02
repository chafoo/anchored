# Eval 1 — /impl-plan (Feature A: filter bar)

**Verdict: PASS** (7/7 assertions) — with one pipeline finding.

Slug created: `todo-filter-bar` · target: /Users/jack/Dev/anchored-test · result: 3 phases, 12 ACs, 7 open questions (2 high / 3 medium / 2 low), status drafted.

## Assertions

| # | Assertion | Passed | Evidence |
|---|---|---|---|
| 1 | New task-file created | ✓ | `.claude/tasks/todo-filter-bar.yml` (9645 bytes) |
| 2 | status == 'drafted' | ✓ | set_task_status returned status: drafted |
| 3 | ≥2 phases | ✓ | 3 phases: filter-bar-markup, filter-mode-state, filter-apply-render |
| 4 | Every phase ≥1 AC, non-empty text | ✓ | 4 + 4 + 4 = 12 ACs, all non-empty |
| 5 | Every AC pending, no evidence | ✓ | all 12 status:pending, no evidence field |
| 6 | ≥1 open question | ✓ | q1–q7 all status:open, origin plan-agent |
| 7 | No source files modified | ✓ | git diff app.js/index.html/style.css empty |

## Behavior notes (the qualitative read)

- **Strong:** the plan-agent surfaced the central risk — the filter's render() predicate has nothing to hook into because the todo core (tasks array + render()) isn't built yet (app.js is an 8-line skeleton) — as TWO high-priority open questions (q1, q2) instead of silently picking an ordering. That's exactly the brainstorm-only / generous-surfacing behavior the skill's "Why we moved Q&A out of plan" section wants.
- **Phase decomposition** is clean and dependency-ordered (markup → state → render), which is what next_phase needs in build.
- **Rules distributed per phase** with phase-specific `why` strings (dom.md on markup+render, storage.md+vanilla-only on state).
- Schema directive auto-injected on line 1 (MCP renderer contract held).

## FINDING — anchored:rules agent missed existing rules

The `anchored:rules` discovery agent reported `.claude/` does not exist and returned an empty must_follow/worth_knowing — but `.claude/rules/` actually contains 3 rule files (`_pattern/vanilla-only.md`, `_concern/storage.md`, `_concern/dom.md`), which the parallel Explore agent DID find. Likely a Glob/path-resolution miss in the subagent. Impact here was neutralized (I passed the correct rules to the plan-agent manually, so per-phase rules are present), but in an unsupervised run the plan would carry zero rules. **rules-check in /impl-refine (Eval 2) should catch the coverage gap** — worth watching whether it does. Root-cause candidate: rules agent's recursive glob over `.claude/rules/**/*.md` when rules live in subdirectories (`_concern/`, `_pattern/`).

## Execution note

Run main-loop-driven (not a with-skill subagent): I followed plugin/skills/impl-plan/SKILL.md, spawned Explore + anchored:rules + anchored:plan directly, applied the plan-agent's structured return via mcp__plugin_anchored_task__* with project_root=sandbox. Faithful to the prose; carries author context (not a blind run).
