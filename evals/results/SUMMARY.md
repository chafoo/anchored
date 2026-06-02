# anchored lifecycle-skills — behavioral eval suite (run 1)

Target sandbox: `/Users/jack/Dev/anchored-test` (vanilla-JS todo app skeleton) · local dev MCP via the repo's built `dist`.
Feature A: a filter bar (All/Active/Completed, persisted), built chained through the lifecycle. One slug: `todo-filter-bar`.
Execution: main-loop-driven (I followed each SKILL.md and spawned the skill's own helper agents directly), one eval per `/loop` iteration; the build split a phase per wakeup for context. Ended 4/5 by user choice — Eval 5 (/impl autopilot) deferred as an optional follow-up since it only re-composes the four sub-skills already validated here.

## Verdicts

| # | Skill | Verdict | Score | One-line |
|---|---|---|---|---|
| 1 | /impl-plan | **PASS** | 7/7 | drafted task, 3 phases / 12 ACs / 7 open Qs; the core dependency surfaced as 2 high questions instead of being silently decided |
| 2 | /impl-refine | **PASS** | 6/6 | drafted→refined, 9 Qs resolved (AI-all); plan-check + rules-check both did real work |
| 3 | /impl-build | **PASS** | 6/7* | refined→build→wrap, 2 phases done / 1 honestly blocked; evidence-honesty USP demonstrated end-to-end |
| 4 | /impl-wrap | **PASS** | 4/4 | wrap→done, audit-grade TL;DR surfacing the blocked phase + all 9 autonomous decisions |
| 5 | /impl | deferred | — | full-lifecycle autopilot; deferred by user (would re-exercise 1-4) |

*Eval 3 AC7 (feature fully functional) partial **by design** — phase 3 blocked on the deliberately-unbuilt todo core, not a skill defect.

## What worked — the thesis held

- **Evidence-honesty USP, proven (Eval 3).** The filter's render-predicate phase required a `render()` + `tasks` array that don't exist (the todo core is a separate unbuilt task). The implement worker **refused to fabricate** — wrote zero code, declined even a speculative helper, and returned an honest blocker with a concrete unblock path. The orchestrator treated it as a bounded `blocked` terminal (no spurious stop, because the plan had anticipated the dependency via q1) and terminated cleanly to wrap. A worker that would rather block than turn an AC green dishonestly is the whole point.
- **Validators don't take claims on faith (Eval 3).** task-validate **independently re-ran** the implement worker's Node DOM/localStorage harness (10/10 green) rather than trusting "verified via harness." code-validate confirmed storage.md + vanilla-only adherence and correctly recognized the defensive `typeof render` guard as intended, not a gap.
- **Generous ambiguity-surfacing (Eval 1) + real gate work (Eval 2).** plan surfaced the hard cross-task dependency as 2 high questions; refine's plan-check added 2 more genuine integration questions and rules-check caught a real per-phase coverage gap.
- **Audit-grade wrap (Eval 4).** Honest 8/12 AC ratio (no rounding up), blocked phase surfaced with unblock path, and every one of the 9 `source='ai'` decisions enumerated by phase for human review.

## Actionable findings for the repo

1. **Rules-discovery glob misses underscore-prefixed dirs (HIGH — confirmed twice).** The `anchored:rules` agent (Eval 1) reported `.claude/` doesn't exist and returned zero rules, when `.claude/rules/_concern/` + `_pattern/` hold 3 real rule files. Root-caused in Eval 2: a recursive `**/*.md` glob treats `_`-prefixed directories as hidden/ignored. Both plan-check and rules-check hit the same wall and worked around it with Grep + direct Read; the plan-stage rules agent did NOT and whiffed. **Fix:** the rules / plan-check / rules-check discovery should not rely on `**/*.md` alone — use Grep-based file discovery (or dotglob-equivalent) so rule dirs like `_concern`/`_pattern` are found. In an unsupervised run this would ship a plan with zero rules attached.
2. **/impl-build doesn't flip refined→build at entry (LOW — same nit as the dynamic-workflow-executor epic).** The task sat at `refined` through the whole build; the final `wrap` transition then failed (`refined → wrap` illegal) and needed a manual `refined → build → wrap`. The skill prose implies the task enters `build` but never explicitly issues the flip up front. Worth making the refined→build transition explicit in the build skill's pre-flight.
3. **No browser/console harness (LOW — sandbox property).** Markup-phase AC "no console errors in a browser" can only be verified structurally here. Fine for this sandbox; note for any project asserting runtime behavior without a runner.

## Artifacts

- `evals/evals.json` — the 5-eval suite definition.
- `evals/runner.md` — the per-iteration loop driver.
- `evals/results/eval-{1,2,3,4}-*.md` — per-eval breakdowns (assertions + behavior notes).
- `evals/results/progress.json` — final state (next_order=5).
- `evals/results/fixtures/{drafted,refined,wrap,done}-todo-filter-bar.yml` — task-file snapshot at each lifecycle stage. **Reusable as seeds for a future ISOLATED (non-chained) suite** — e.g. drop `refined-…` into a sandbox to test /impl-build alone without re-running plan+refine.

## Suggested next steps

- **Fix finding #1** (the glob) — it's the only finding that would cause a real unsupervised-run defect.
- **Eval 5 (/impl autopilot)** remains open. To test the autopilot *happy path* (full chain to `done`, no blocked phase), pick a **core-independent** Feature B (e.g. a persisted dark-mode toggle) rather than clear-completed (which depends on the same unbuilt todo core and would just re-block).
- **Isolated suite:** with the stage fixtures above, a second suite could test each skill from a clean precondition (no chaining), isolating skill behavior from upstream-stage quality.
