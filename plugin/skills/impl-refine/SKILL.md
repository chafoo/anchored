---
name: impl-refine
description: |
  Validate a drafted plan against current code + rules, then apply
  user-defined architecture preferences. Use after /impl-plan to
  refine the plan before /impl-build. Spawns plan-check (drift +
  semantic gaps) and rules-check (rules coverage) as mandatory
  gates, then runs any custom steps from anchored.yml.refine.steps,
  then transitions task status `drafted → refined`. Explicit-only
  trigger — the user types `/impl-refine` (optionally with a task
  slug).
---

# /impl-refine

## Communication style

See `plugin/references/communication-style.md` for the full principle —
partner voice in chat, machinery voice only in audit + verbose mode.

Skill-specific:

| Avoid (machinery voice) | Prefer (partner voice) |
|---|---|
| "Spawning plan-check + rules-check gates..." | "Lass mich den plan kurz gegen den aktuellen code-stand prüfen." |
| "Stage 1 complete: 2 auto-fixes applied, 1 → ? marker surfaced" | "Zwei kleine path-patches gemacht, eine struktur-frage ist offen für dich." |
| "Status transition: drafted → refined" | "Plan ist refined. Run `/impl-build` als nächstes." |

You are the orchestrator for the `/impl-refine` lifecycle phase. The
user invoked you on a task whose status is `drafted` — the plan
agent has written an initial task-file. Your job: run plan-check
and rules-check against current code and rules, run any user-defined
refine steps, then transition the task to `refined` so `/impl-build`
can pick it up.

This skill is **explicit-only**. The user typed `/impl-refine` —
proceed.

## Pre-flight

Run these checks before touching anything. **Stay silent about steps
that succeed without user input** — only narrate when something needs
the user's attention.

1. **Load `anchored.yml`** from the project root.
   - If it exists: parse it silently.
   - If missing: refuse with: "No anchored.yml found. Run
     `/impl-plan` first to bootstrap this project."
2. **Resolve the task slug.**
   - If the user passed a slug as argument, use it.
   - Otherwise, find the candidate task-file:
     - If exactly one `.claude/tasks/<slug>.yml` exists with
       `status: drafted`, use that.
     - Otherwise, list candidates and ask which.
3. **State gate.** Call `mcp__task__read(project_root, slug)`:
   - `status: drafted` → proceed.
   - `status: plan` → refuse: "Plan hasn't been drafted yet —
     run `/impl-plan` first."
   - `status: refined` → refuse: "Task `<slug>` is already
     refined. To re-verify, flip status back to drafted:
     `anchored task status set <slug> drafted`."
   - `status: build` → refuse: "Task `<slug>` is already in build.
     To re-refine, flip status back to drafted first:
     `anchored task status set <slug> drafted`."
   - `status: wrap` → refuse: "Task `<slug>` is past build (status:
     wrap). To re-refine, manually flip status back to drafted
     first."
   - `status: done` → refuse: "Task `<slug>` is already done. To
     re-refine, manually flip status back to drafted first."

## Pipeline

The refine pipeline has 4 stages, run in order. Stages 1 and 2 are
mandatory framework gates and cannot be disabled. Stage 3 runs
user-defined steps. Stage 4 transitions status.

### Stage 1 — plan-check (mandatory gate)

Spawn the `plan-check` agent (`plugin/agents/plan-check.md`) with:
- PROJECT_ROOT: absolute path to the user's project root
- TASK_SLUG: the slug
- USER_EXTENSION: `anchored.yml.refine.plan_check.instructions` prose
  (appended to the agent's default brief; may be empty)

The plan-check agent:
- Reads the task-file via `mcp__task__read`.
- Inspects each phase's affected paths against current code; surfaces
  drift between what the plan says and what's actually there.
- Auto-fixes additive / non-semantic items in place via
  `mcp__task__set_phase_rules`, `set_phase_context`, `append_plan`.
- Surfaces semantic gaps as new `→ ?` markers via `append_plan` for
  the orchestrator to resolve with the user in Q&A.
- Returns a structured rollup: counts of auto-fixes applied, list of
  new `→ ?` markers added.

After plan-check returns:

1. Append its rollup to `context.build → plan-check` via
   `mcp__task__append_build_section(project_root, slug, "plan-check", rollup)`
   (the build subsection serves as the audit trail for the gate).
2. Re-read the task-file via `mcp__task__read`.
3. Run a Q&A loop on any new `→ ?` markers in `context.plan`:
   - For each marker, ask the user via `AskUserQuestion`.
   - Resolve via `mcp__task__resolve_question(project_root, slug,
     q_index, resolution)` with
     `resolved: <answer> (confirmed by user, <YYYY-MM-DD>)` or
     `deferred: <reason> (confirmed by user, <YYYY-MM-DD>)`.
   - Resolve in REVERSE order (highest index first) so earlier
     indices stay stable, OR re-count via `mcp__task__read` between
     each call.
4. If the user aborts the Q&A loop (Ctrl+C), STOP here. Status stays
   at `drafted`. Auto-fixes already applied are preserved (per-op
   atomicity). The user can re-run `/impl-refine` to resume.

### Stage 2 — rules-check (mandatory gate)

Runs AFTER plan-check so it sees any structural reshaping.

Spawn the `rules-check` agent (`plugin/agents/rules-check.md`) with:
- PROJECT_ROOT, TASK_SLUG
- USER_EXTENSION: `anchored.yml.refine.rules_check.instructions` prose

The rules-check agent:
- Inspects rules-coverage per phase (are the right rules attached
  given each phase's affected paths?).
- Detects plan-vs-current-rules drift (rules referenced in the plan
  that no longer exist, or new rules in `.claude/rules/` that the
  plan should know about).
- Detects cross-phase rule conflicts (same path referenced by phases
  with incompatible rule sets).
- Auto-fixes additive items via `mcp__task__set_phase_rules` and
  `append_plan`.
- Surfaces semantic gaps as new `→ ?` markers.

After rules-check returns:

1. Append rollup to `context.build → rules-check` via
   `mcp__task__append_build_section(project_root, slug,
   "rules-check", rollup)`.
2. Re-read the task-file.
3. Run a Q&A loop on any new `→ ?` markers (same mechanism as Stage
   1). Abort semantics identical: Ctrl+C leaves status at drafted,
   auto-fixes preserved.

### Stage 3 — custom user steps

For each step in `anchored.yml.refine.steps[]` (in declaration
order):

- A step has either `{ name, run: '<shell command>' }` or
  `{ name, use: '<named tool>' }`.
- `run:` → execute via Bash. Capture stdout + stderr.
- `use:` → invoke the named tool (spawn an agent by name, or call an
  MCP tool, depending on how the user has wired it).
- Capture each step's output to `context.build → refine.<step-name>`
  via `mcp__task__append_build_section(project_root, slug,
  "refine.<step-name>", output)`.
- **Halt on failure.** If a step exits non-zero (or returns an error),
  stop the pipeline. Status stays at `drafted`. Surface the failure
  to the user with the captured output. Re-running `/impl-refine`
  re-fires the pipeline from Stage 1 (additive auto-fixes are
  idempotent in practice).

If `anchored.yml.refine.steps` is empty or absent, skip this stage
silently.

### Stage 4 — status transition

After Stages 1-3 complete successfully (no aborts, no step failures):

1. Re-read the task-file one last time to confirm it's clean (no
   `→ ?` markers, parses cleanly).
2. Call `mcp__task__set_task_status(project_root, slug, "refined")`.
   The factory atomically flips status `drafted → refined`.
3. Tell the user (see Completion message below).

The transition is **atomic** — status only flips to `refined` if
everything above succeeded.

## Abort + resume semantics

- **Ctrl+C anywhere mid-pipeline** → status STAYS at `drafted`.
  Partial auto-fixes applied by plan-check / rules-check are
  preserved on the task-file (each MCP op is atomic).
- **Re-running `/impl-refine`** picks up from Stage 1. plan-check
  fires fresh, which is fine — its auto-fixes are additive /
  idempotent in practice; if everything's already clean it surfaces
  no new markers and the gate passes immediately.
- **User aborts during a Q&A loop** → same: status stays drafted,
  prior auto-fixes preserved. Re-run to resume.

## Completion message

When Stage 4 succeeds, tell the user:

> Plan refined. Status: drafted → refined. Plan-check applied N
> auto-fixes. Rules-check applied M auto-fixes. K custom steps ran.
> Next: `/impl-build` to start phase execution.

Use the actual counts captured from each stage's rollup. If a count
is zero, say "Plan-check applied no auto-fixes — plan was already
aligned with current code" (similar for rules-check).

## Framework defaults (always run)

- Refuse to run if task status ≠ `drafted` (manual revert via
  `anchored task status set <slug> drafted` is the documented
  escape-hatch).
- ALWAYS spawn `plan-check` — Stage 1 is framework-fixed.
- ALWAYS spawn `rules-check` — Stage 2 is framework-fixed, runs
  AFTER plan-check.
- ALWAYS run the Q&A loop after each mandatory gate; never let `→ ?`
  markers leak past refine.
- Capture every gate's rollup to `context.build` via
  `append_build_section` so the audit trail survives.
- Halt the pipeline (status stays drafted) on any step failure or
  user abort; per-op atomicity preserves partial progress.
- Transition `drafted → refined` ONLY if all stages succeed cleanly.

## References on demand

When you need to recheck format details:

- `references/state-mutations.md` — MCP tool reference (the full
  mutation surface plan-check / rules-check / refine pipeline use)
- `references/default-config.yml` — what's configurable under
  `refine.*` in anchored.yml
- `references/task-file-schema.md` — task-file structure
