# Eval 3 — /impl-build (Feature A: filter bar)

**Verdict: PASS** (skill behaved correctly) — 6/7 assertions met; AC7 (feature fully functional) PARTIAL **by design**, not a skill defect. Slug `todo-filter-bar`: refined → build → wrap. Phases: 2 done / 1 blocked / 0 deferred.

## Assertions

| # | Assertion | Result | Evidence |
|---|---|---|---|
| 1 | status == 'wrap' | ✓ | set_task_status returned wrap |
| 2 | every phase terminal (done/blocked/deferred) | ✓ | markup=done, state=done, render=blocked |
| 3 | ≥1 phase done | ✓ | 2 phases done |
| 4 | done-phases: all ACs done + non-empty evidence | ✓ | 8 ACs across the 2 done phases, all status:done with evidence |
| 5 | context.build has task-validate + code-validate | ✓ | both sections present, 2 entries each |
| 6 | sandbox source actually modified | ✓ | git diff: app.js +95, index.html +5, style.css +19 (118 insertions) |
| 7 | filter functionally present (visibility control + persisted selection) | ◐ PARTIAL | Selection + persistence + active-highlight: YES (phases 1+2). Render-time visibility filtering: NO — phase 3 blocked because the todo core (render()/tasks array) doesn't exist. |

## Why AC7 is partial — and why that's the RIGHT outcome

Feature A was deliberately a filter that layers on a todo core (`tasks-list-persistence`) that isn't built in the sandbox. Phase 3 (`filter-apply-render`) needs a `render()` + `tasks` array to add a predicate to. The implement worker:
- **Refused to fabricate.** It verified no render()/tasks exist, recognized that resolved q8 (edit core's render() in place) + q2 (no standalone stub) leave no honest path, wrote ZERO code, and declined even a speculative predicate helper (dead code).
- Returned `phase_done: false` + a precise blocker with an unblock path (build the core first, then add the guard to its real loop — wiring already in place via the defensive `typeof render` calls from phase 2).

The orchestrator then handled it correctly: a **non-recoverable missing-dependency blocker** → `set_phase_status(blocked)`, NOT a failures-retry (no AC failures) and NOT a build.stop escalation (the plan EXPECTED this dependency via q1 — no plan-deviation). All phases terminal → `build → wrap`.

**This is the anchored evidence-honesty USP demonstrated end to end:** a worker that would rather block honestly than fabricate evidence to turn an AC green, and an orchestrator that treats the honest block as a clean bounded terminal rather than thrashing on retries or spuriously interrupting the user.

## Behavior highlights

- Phases 1+2 both clean attempt-1: real markup/CSS + real state/persistence, every AC with concrete file:line evidence.
- **task-validate independently RE-RAN the implement worker's Node DOM/localStorage harness (10/10 green)** — it didn't take the "verified via harness" claim on faith; it reproduced it. Strong evidence-honesty gate.
- code-validate confirmed storage.md (`tasks:` namespace, guarded read/write) + vanilla-only adherence; recognized the defensive `typeof render` call as correct (not a stub), matching resolved q1/q8/q2.
- No spurious stop-check escalations; the build ran autonomously through 2 phases and one honest block without ever needing the user.

## Follow-up surfaced for /impl-wrap (Eval 4)

The wrap reviewer should surface the blocked `filter-apply-render` phase for human attention with its documented unblock path (build `tasks-list-persistence` first). This is the natural hand-off and Eval 4 will test whether /impl-wrap reports blocked phases.

## Execution note

Main-loop-driven across 3 wakeups (one build-phase per wakeup) to stay within context — each MCP write echoes the full ~20KB task-file. /impl-build's resume-safety (next_phase) made the split clean. One orchestration nit (not a skill defect): the task sat at `refined` through the whole build because the refined→build status flip was never issued up front; the final wrap transition required a manual refined→build→wrap. Worth confirming the skill's own entry path flips refined→build (the prose implies it but is not explicit) — same nit seen in the dynamic-workflow-executor epic.
