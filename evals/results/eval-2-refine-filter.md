# Eval 2 — /impl-refine (Feature A: filter bar, walk-style AI-all)

**Verdict: PASS** (6/6 assertions). Slug: `todo-filter-bar` · drafted → refined.

## Assertions

| # | Assertion | Passed | Evidence |
|---|---|---|---|
| 1 | status == 'refined' | ✓ | set_task_status returned refined |
| 2 | 0 questions open | ✓ | grep "status: open" = 0; 9 resolved |
| 3 | resolved Qs have answer; ai → reasoning | ✓ | 9 source:ai, 9 reasoning blocks |
| 4 | context.build has plan-check + rules-check | ✓ | both subsections present |
| 5 | phase count unchanged | ✓ | still 3 phases |
| 6 | all AC texts preserved | ✓ | 12 ACs intact, none mangled |

## Behavior notes — the gates did real work

- **rules-check caught a genuine coverage gap I'd missed in eval 1's manual pass:** `vanilla-only.md` was only on the state/render phases, not on filter-bar-markup, even though that phase edits index.html + style.css (both files the rule explicitly governs). It auto-fixed it (additive, full-list replace). Correct, additive-only, with a phase-specific `why`.
- **plan-check surfaced 2 real integration questions (q8 high, q9 medium)** the plan-agent hadn't: phase 3 injects a predicate into a render() that the SIBLING task authors — who owns render()'s structure, and is the `done`-field assumption stable. These are exactly the cross-task seams a plan-stage agent misses. Verdict needs-attention with 0 auto-fixes otherwise (it confirmed every path/line ref resolves and no hidden defaults — the plan was honest).
- **AI-all walk** resolved all 9 (7 plan-agent + 2 plan-check) autonomously with concrete reasoning; q1→q8 chain stayed consistent (depend-on-core → edit render() in place, not a parallel stub).
- Both rollups + 2 info-notes landed in context.build / plan trail; source untouched.

## CROSS-CHECK CONFIRMED — root cause of the Eval-1 rules whiff

Both plan-check AND rules-check independently flagged: recursive Glob `.claude/rules/**/*.md` returns ZERO files because the rule files live under **underscore-prefixed dirs** (`_concern/`, `_pattern/`), which the glob engine treats as hidden/ignored. Both worked around it (Grep + direct Read). This is the exact defect that made the plan-stage `anchored:rules` agent whiff in Eval 1 — now root-caused. **Actionable fix for the repo:** the rules / rules-check / plan-check agents' discovery glob should not rely on `**/*.md` alone when rule dirs may be underscore-prefixed (use Grep-based file discovery or an explicit dotglob-equivalent). This is the single most valuable finding of the suite so far.

## Execution note

Main-loop-driven: spawned anchored:plan-check + anchored:rules-check in parallel on the pre-read snapshot, applied findings via MCP (set_phase_rules, question_add ×2, append_plan, append_build_section ×2), ran the AI-all walk (question_resolve ×9), flipped to refined. MCP tool responses echo the full task-file (now ~16KB) — verified end-state via disk grep to avoid context bloat.
