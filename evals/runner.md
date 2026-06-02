# anchored skill-eval runner (driven by /loop, dynamic mode)

One eval per loop iteration, against the sandbox at `/Users/jack/Dev/anchored-test`.
State lives in `evals/results/progress.json` so the loop survives compaction.

## Each iteration

1. **Load state.** Read `evals/evals.json` and `evals/results/progress.json`.
   If `progress.json` is missing, this is iteration 1 → create
   `evals/results/`, write `progress.json` = `{ "next_order": 1, "slugs": {}, "results": [] }`,
   and run the **reset** from evals.json (delete prior suite task-files — slugs
   containing `filter` or `clear-completed` — from the sandbox `.claude/tasks/`;
   never touch `tasks-list-persistence.yml` or `_archive/`).

2. **Pick the eval** with `order == next_order`. If none (`next_order > 5`) →
   **suite complete**: write `evals/results/SUMMARY.md` (table of every eval's
   verdict + which assertions failed), tell the user the rollup, and **STOP the
   loop — omit ScheduleWakeup.**

3. **Resolve the slug.** Evals 2-4 reuse the slug eval 1 created (read it from
   `progress.json.slugs.A`). Eval 1 + 5 create a new slug — capture it into
   `progress.json.slugs` (`A` for the filter task, `B` for clear-completed)
   right after the skill creates the task-file.

4. **Run the skill non-interactively** per evals.json `autonomy`:
   - `/impl-refine` → walk-style **AI-all** (resolve every question source='ai'
     with reasoning; never AskUserQuestion).
   - `/impl-build` + `/impl` → default autonomous mode. If the skill would
     escalate a genuine stop / blocking question to the user, **do not answer
     it** — capture `outcome: "halted: <which phase/skill, why>"` and treat the
     eval as recorded (a halt is a finding, not a loop failure).
   - Substitute the resolved slug for `<filter-slug>` in the prompt.

5. **Grade.** Check each assertion against (a) the resulting task-file —
   `mcp__anchored__task__read` or disk read of `.claude/tasks/<slug>.yml` — and
   (b) the sandbox source diff (`git -C /Users/jack/Dev/anchored-test diff --stat`).
   For each assertion record `{ text, passed: true|false, evidence }`.

6. **Record.** Append to `progress.json.results`: `{ order, id, skill, verdict:
   "pass"|"partial"|"fail"|"halted", passed_count, failed_count, notes }`.
   Also write a per-eval file `evals/results/eval-<order>-<id>.md` with the full
   assertion breakdown + a short transcript-of-behavior note (did it stay in
   partner voice? did gates fire? did it stop where it should?). Then set
   `next_order = order + 1`.

7. **Continue the loop.** Schedule the next iteration: `ScheduleWakeup`
   `delaySeconds: 60`, same `/loop` prompt verbatim. (No external process to
   wait on — 60s just chains turns; the skill run itself is the slow part.)

## Verdict semantics

- **pass** — all assertions passed.
- **partial** — core behavior worked but ≥1 non-fatal assertion failed (note which).
- **fail** — a status/state assertion failed (skill did the wrong thing).
- **halted** — skill escalated to the user; recorded with reason, loop moves on.

## Notes

- Evals 1-4 are chained: a `fail` on eval N still lets N+1 run, but flag in the
  result that the precondition was degraded (downstream verdicts are suspect).
- After each PASS, snapshot the task-file into
  `evals/results/fixtures/<status>-<slug>.yml` — these become reusable seeds for
  a future isolated (non-chained) suite.
