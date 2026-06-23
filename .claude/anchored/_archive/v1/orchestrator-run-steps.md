# Ticket: Orchestrator runs its own `run:`/`use:` steps (custom build/wrap steps)

**Status:** implemented + verified (all ACs done; workflow cross-check pending)
**Created:** 2026-06-11
**Source:** version-control strategy wish (one branch per task, one commit per phase,
local merge onto `develop`) — surfaced when wiring it into `anchored-test/anchored.yml`.

## Problem

The substrate side has been able to do custom steps for a while: `merge(default, user)` merges
`steps` keyed-by-name + extend-only, and `anchored steps <tier> <stage>` already returns
a `{name, run}` step as `{kind:'run', run:'…'}` in the plan (verified). **But** the LIVE
orchestrator in plugin operation is the SKILL (not the in-process engine — a headless
subprocess can't reach the Task tool to spawn an agent). And `plugin/skills/build/SKILL.md` +
`wrap/SKILL.md` so far only described spawning the named workers
(implement/task-validate/code-validate, review/summarize) — the generic
execution of `kind:'run'`/`kind:'use'` steps was **never written**.

Consequence: a `commit` step in `phase.build.steps` would appear in the plan but be
silently skipped by the orchestrator. Plain `anchored.yml` config therefore is not
enough — the orchestrator has to actually run the steps too.

**No core/engine/factory code affected** — the gap is solely in the
orchestrator prose (two SKILL.md files).

## Acceptance criteria

- **a1** — `build/SKILL.md` runs `kind:'run'` steps of the phase pipeline via Bash
  (in declaration order; trailing after the gates, only on a green
  phase) and `kind:'use'` steps as subagent/skill. **done**
  → `plugin/skills/build/SKILL.md` section "Custom run/use steps".
- **a2** — variable contract documented + passed as real environment variables to
  every `run:` step: `TASK_SLUG`, `PHASE_SLUG`, `PHASE_NAME`,
  `EPIC_SLUG` (no hand-rolled string replace). **done**
  → table + `TASK_SLUG='…' … bash -c "$STEP_RUN"` form in the build skill.
- **a3** — `wrap/SKILL.md` runs trailing `kind:'run'` steps (e.g. `merge`) after
  review+summarize, before the `done` flip; a failed step stays pre-`done`.
  **done** → wrap skill section "Custom run/use steps".
- **a4** — fan-out caveat documented: branch-per-task in parallel
  task fan-out (epic, q8) needs git-worktree isolation, otherwise sequential.
  **done** → note in the build skill.
- **a5** — grep tests secure the skill prose (run-step dispatch + variable
  contract in both skills). **done**
  → `workflow-smoke.spec.ts`: "orchestrator dispatches custom run/use steps".
- **a6** — mechanism proven live: in a real test git repo the
  version-control `anchored.yml` actually produces, via `anchored steps` + execution of the run string,
  branch `task/<slug>` + two phase commits + `--no-ff` merge onto
  `develop` (variable contract expands correctly). **done**
- **a7** — plugin version 0.1.3 → 0.1.4; all 5 gates green (lint/format/
  typecheck/test/build). **done**

## Workflow cross-check (2026-06-11, 4 agents)

Verdict: **works-with-gaps** — the mechanism holds (branch + 2 phase
commits + `--no-ff` merge proven live, commit fires only on a green phase,
merge stays pre-`done` on conflict). Three documentation findings fixed:

- **MAJOR-1** `config.md:93` taught `git commit -am "$SLUG"` — `$SLUG` undefined
  → empty commit message. Fixed to `${TASK_SLUG}` + authoritative variable
  table in `config.md` + warning in the setup skill.
- **MAJOR-2** `after:`/`before:` positioning documented nowhere + silent
  append on a wrong anchor. Fixed: positioning subsection in `config.md` +
  "check the order" note in the setup skill.
- **MAJOR-3** git-ref D/F collision on prefix-related epic child slugs
  (`task/x` vs `task/x/y`). Not fixed in the framework (the version-control branch expression lives
  only in `anchored-test/anchored.yml`) — recommendation to the user: flatten in the branch name
  with `tr '/' '-'`, in case tasks have prefix-related nested slugs.

## Non-goals

- No version-control opinion in the framework default — the default template stays
  version-control-agnostic. The version-control strategy lives only in `anchored-test/anchored.yml`
  (built by the user via `/a:setup`).
- No engine/core change — the steps-planner already delivers run steps.
