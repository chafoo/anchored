---
name: impl-refine
description: |
  Engineering-review skill — declares autonomy, validates a drafted
  plan against current code + rules, walks every open question with
  the user (or AI under autonomy), then applies user-defined
  architecture preferences. Use after /impl-plan to validate the plan
  before /impl-build. Spawns plan-check + rules-check (mandatory
  parallel gates), then consolidates all open questions (from
  plan-agent + plan-check + rules-check) into a single priority-aware
  walk, then runs custom steps from anchored.yml.refine.steps, then
  transitions task status `drafted → refined`. Explicit-only trigger —
  the user types `/impl-refine` (optionally with a task slug).
---

# /impl-refine

## Communication style

See `plugin/references/communication-style.md` for the full principle —
partner voice in chat, machinery voice only in audit + verbose mode.

Skill-specific:

| Avoid (machinery voice) | Prefer (partner voice) |
|---|---|
| "Setting autonomy to ask_high_only" | "Okay — die wichtigen kläre ich mit dir, den rest mach ich selbst." |
| "Spawning plan-check + rules-check gates in parallel..." | "Lass mich den plan kurz gegen den aktuellen code-stand prüfen." |
| "Stage 3: resolving question q4 via user input" | "Toggle-pattern — whole-row click oder dedicated checkbox?" |
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

The refine pipeline has 6 stages, run in order. Stages 0, 1, 2, 3
are mandatory framework gates and cannot be disabled. Stage 4 runs
user-defined steps. Stage 5 transitions status.

```
Stage 0 — autonomy declaration  (NEW in V0.3)
Stage 1 — plan-check            (mandatory gate, no Q&A here)
Stage 2 — rules-check           (mandatory gate, no Q&A here)
Stage 3 — consolidated Q&A walk (NEW in V0.3 — priority-aware)
Stage 4 — custom user steps
Stage 5 — status transition (drafted → refined)
```

### Stage 0 — autonomy declaration

This is where the user picks how autonomous the rest of the run
should be. The choice is **task-scoped + idempotent** — they can
flip it later if they change their mind; each set appends an
audit entry to the plan-trail.

1. List open questions on the task to get the priority breakdown:

   ```
   const open = await mcp__task__question_list(
     project_root, slug,
     filter: { status: 'open' }
   )
   const high = open.filter(q => q.priority === 'high').length
   const medium = open.filter(q => q.priority === 'medium').length
   const low = open.filter(q => q.priority === 'low').length
   ```

2. **If `open.length === 0`**: no questions to walk. Default
   autonomy to `ask_high_only` silently (lowest-friction safe
   default), call `mcp__task__set_autonomy(slug, 'ask_high_only')`,
   and skip to Stage 1. Mention in the completion message that
   the plan-agent surfaced no questions.

3. **Otherwise**, ask the user via `AskUserQuestion`:

   > "Es gibt {open.length} offene fragen — {high} high, {medium} medium, {low} low. Wie wollen wir die durchgehen?"
   >
   > Options:
   > - "Alle gemeinsam durchgehen" (sets autonomy = `ask_all`)
   > - "Nur die wichtigen (high), rest entscheidest du" (sets autonomy = `ask_high_only`) (recommended for medium/high mix)
   > - "Du entscheidest alles — ich vertraue dir" (sets autonomy = `decide_all`) (recommended for low-stakes tasks / vibe coding)

   Adapt option count to question distribution:
   - If `low === 0` and `medium === 0`: only show `ask_all` vs
     `decide_all` (the `ask_high_only` option is identical to
     `ask_all` when all questions are high)
   - If `high === 0` and `medium === 0`: only show `ask_all` vs
     `decide_all` (everything is low, no priority bucket to filter
     by)
   - Otherwise: show all three

4. Call `mcp__task__set_autonomy(project_root, slug, choice)`.
   The op appends an audit line to `context.plan`:
   `→ autonomy set to <choice> at <ISO>`.

5. Confirm to the user in pair-programmer voice ("Okay, die
   wichtigen kläre ich mit dir, den rest mach ich selbst.")

### Stage 1 — plan-check (mandatory gate, parallel-safe)

Spawn the `plan-check` agent (`plugin/agents/plan-check.md`) with:
- PROJECT_ROOT: absolute path to the user's project root
- TASK_SLUG: the slug
- USER_EXTENSION: `anchored.yml.refine.plan_check.instructions` prose
  (appended to the agent's default brief; may be empty)

The plan-check agent:
- Reads the task-file via `mcp__task__read`.
- Inspects each phase's affected paths against current code;
  detects drift between what the plan says and what's actually there.
- Auto-fixes additive / non-semantic items in place via
  `mcp__task__set_phase_rules`, `set_phase_context`, `append_plan`.
- **Surfaces semantic gaps as new structured questions via
  `mcp__task__question_add` (priority-tagged).**
- Scans for unilateral defaults the plan-agent may have hidden in
  prose (the V0.2 dogfood failure mode) — surfaces those as
  high-priority questions.
- MAY retag plan-agent questions whose priority it disagrees with.
- **Does NOT resolve questions.** That's Stage 3.
- Returns a structured rollup: counts of auto-fixes + counts of new
  questions by priority + retag count.

After plan-check returns:

1. Append its rollup to `context.build → plan-check` via
   `mcp__task__append_build_section(project_root, slug,
   "plan-check", rollup)` — the audit trail for the gate.
2. **No Q&A here.** Open questions accumulate; they get walked in
   Stage 3.

**Parallel-safe with Stage 2**: plan-check and rules-check touch
different file regions (phase.context + plan-trail vs phase.rules).
For speed, you MAY spawn both agents in parallel and `await Promise.all`
on their results. The cross-process lock in the factory serializes
overlapping writes — neither agent will see a torn file.

### Stage 2 — rules-check (mandatory gate, parallel-safe)

Spawn the `rules-check` agent (`plugin/agents/rules-check.md`) with:
- PROJECT_ROOT, TASK_SLUG
- USER_EXTENSION: `anchored.yml.refine.rules_check.instructions` prose

The rules-check agent:
- Inspects rules-coverage per phase (are the right rules attached
  given each phase's affected paths?).
- Detects orphaned rule references (path no longer exists on disk).
- Detects cross-phase rule conflicts (same path with incompatible
  rule sets).
- Auto-fixes additive items via `mcp__task__set_phase_rules`.
- Surfaces non-additive items as structured questions via
  `mcp__task__question_add` (priority-tagged: conflicts=high,
  orphans=medium, informational gaps=low).
- MAY retag questions (rare).
- **Does NOT resolve questions.** Stage 3 handles that.

After rules-check returns:

1. Append rollup to `context.build → rules-check` via
   `mcp__task__append_build_section(project_root, slug,
   "rules-check", rollup)`.
2. **No Q&A here.** Same as Stage 1 — questions accumulate for
   Stage 3.

### Stage 3 — consolidated priority-aware Q&A walk

This is where every open question (from the plan-agent's brainstorm
PLUS plan-check's additions PLUS rules-check's additions) gets
resolved in one consolidated pass. The autonomy level chosen at
Stage 0 controls whether each question goes to the user or to AI
judgment.

1. List all open questions, sorted by priority (high → medium → low),
   then by id (for stable ordering):

   ```
   const open = await mcp__task__question_list(
     project_root, slug,
     filter: { status: 'open' }
   )
   open.sort((a, b) => {
     const order = { high: 0, medium: 1, low: 2 }
     return order[a.priority] - order[b.priority] || a.id.localeCompare(b.id)
   })
   ```

2. Determine the **ask threshold** from the current autonomy:

   ```
   const autonomy = (await mcp__task__read(slug)).autonomy
   const asksThisPriority = (priority) => {
     if (autonomy === 'ask_all')      return true
     if (autonomy === 'decide_all')   return false
     // ask_high_only
     return priority === 'high'
   }
   ```

3. For each open question (in the sorted order):

   **If `asksThisPriority(q.priority)` is true → ask the user.**

   Use `AskUserQuestion`. Phrase the question in pair-programmer
   voice — use the question text as-is but you may rephrase the
   conversational lead-in:

   > q.text                 # the question itself, verbatim
   >
   > Options:
   > - {parse the parenthetical "(lean X)" hint if present, show as default}
   > - {alternative interpretations the question implies}
   > - "Other (text input)" → free-text answer

   Then:

   ```
   mcp__task__question_resolve(
     project_root, slug, q.id,
     { answer: '<user's answer>', source: 'user' }
   )
   ```

   **If `asksThisPriority(q.priority)` is false → AI decides.**

   Read the relevant code context, evaluate the proposed default
   (the parenthetical "lean X" in the question text), and decide.
   Then:

   ```
   mcp__task__question_resolve(
     project_root, slug, q.id,
     {
       answer: '<your decision>',
       source: 'ai',
       reasoning: '<1-3 sentences explaining WHY — read by /impl-wrap reviewer>'
     }
   )
   ```

   The `reasoning` field is required for `source='ai'`. Keep it
   concrete (cite the code/context that drove the decision), not
   apologetic.

4. **Abort semantics.** If the user aborts mid-walk (Ctrl+C), STOP.
   Status stays at `drafted`. Questions already resolved stay
   resolved (per-op atomicity); remaining open questions stay
   open. Re-running `/impl-refine` picks up at Stage 0 — the user
   can switch autonomy if their initial choice was wrong, then
   Stage 3 walks only the still-open questions.

5. **Override autonomy mid-walk.** If the user says "actually,
   let me decide the rest" or "actually, you decide the rest"
   during the walk, call `mcp__task__set_autonomy` with the new
   value and continue the walk from where you were. The op
   appends an override audit entry; the loop sees the new value
   on the next iteration.

### Stage 4 — custom user steps

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
  re-fires the pipeline from Stage 0 (additive auto-fixes + already-
  resolved questions are idempotent in practice).

If `anchored.yml.refine.steps` is empty or absent, skip this stage
silently.

### Stage 5 — status transition

After Stages 0-4 complete successfully (no aborts, no step failures):

1. Re-read the task-file one last time to confirm:
   - It parses cleanly.
   - Every question has `status: 'resolved'` (no opens left).
   - `autonomy` is set.
2. Call `mcp__task__set_task_status(project_root, slug, "refined")`.
   The factory atomically flips status `drafted → refined`.
3. Tell the user (see Completion message below).

The transition is **atomic** — status only flips to `refined` if
everything above succeeded.

## Abort + resume semantics

- **Ctrl+C anywhere mid-pipeline** → status STAYS at `drafted`.
  Partial auto-fixes by plan-check / rules-check are preserved
  (each MCP op is atomic). Already-resolved questions stay
  resolved. Already-set autonomy stays set.
- **Re-running `/impl-refine`** picks up from Stage 0. The user
  gets re-asked the autonomy choice — they can switch from their
  initial pick if it didn't work out. plan-check + rules-check fire
  fresh (idempotent in practice; if everything's clean, they surface
  no new questions). Stage 3 walks only the still-open questions
  (already-resolved ones are skipped via the status filter).
- **User aborts during Stage 3 Q&A walk** → same: status stays
  drafted, resolved-so-far questions preserved. Re-run to resume.

## Completion message

When Stage 5 succeeds, tell the user. The shape depends on the
autonomy chosen + question distribution:

**Full ask_all path** (user answered everything):

> Plan refined. Status: drafted → refined.
>
> Plan-check + rules-check liefen sauber durch (N + M auto-fixes).
> Wir sind {Q} fragen gemeinsam durchgegangen.
>
> Next: `/impl-build` startet die phase-execution.

**Hybrid ask_high_only path** (user answered high, AI answered the rest):

> Plan refined. Status: drafted → refined.
>
> Plan-check + rules-check liefen sauber durch (N + M auto-fixes).
> Du hast {high} wichtige fragen geklärt, ich hab {medium+low}
> selbst entschieden (im plan-trail mit reasoning festgehalten,
> bei /impl-wrap kannst du das nochmal reviewen).
>
> Next: `/impl-build` startet die phase-execution.

**Full decide_all path** (AI answered everything):

> Plan refined. Status: drafted → refined.
>
> Plan-check + rules-check liefen sauber durch (N + M auto-fixes).
> Ich hab alle {Q} fragen selbst entschieden — reasoning ist im
> plan-trail. Bei /impl-wrap geh ich mit dir nochmal durch was
> ich entschieden hab.
>
> Next: `/impl-build` startet die phase-execution.

**No-questions path** (plan-agent surfaced nothing):

> Plan refined. Status: drafted → refined.
>
> Plan-check + rules-check liefen sauber durch (N + M auto-fixes).
> Plan-agent hatte keine fragen — autonomy auf `ask_high_only`
> gesetzt als default.
>
> Next: `/impl-build` startet die phase-execution.

Use the actual counts captured from each stage's rollup. If a count
is zero, mention it explicitly ("Plan-check fand keinen drift —
plan war schon aligned"). The voice stays pair-programmer (see
communication-style.md).

## Framework defaults (always run)

- Refuse to run if task status ≠ `drafted` (manual revert via
  `anchored task status set <slug> drafted` is the documented
  escape-hatch).
- ALWAYS run Stage 0 — autonomy declaration is framework-fixed.
- ALWAYS spawn `plan-check` — Stage 1 is framework-fixed.
- ALWAYS spawn `rules-check` — Stage 2 is framework-fixed (MAY
  run in parallel with Stage 1; cross-process lock keeps writes
  safe).
- ALWAYS run the Stage 3 consolidated Q&A walk; every open
  question must reach `status: resolved` before Stage 5 fires.
- Capture every gate's rollup to `context.build` via
  `append_build_section` so the audit trail survives.
- Halt the pipeline (status stays drafted) on any step failure or
  user abort; per-op atomicity preserves partial progress.
- Transition `drafted → refined` ONLY if all stages succeed cleanly
  AND no questions remain open AND autonomy is set.

## References on demand

When you need to recheck format details:

- `references/state-mutations.md` — MCP tool reference (the full
  mutation surface plan-check / rules-check / refine pipeline use)
- `references/default-config.yml` — what's configurable under
  `refine.*` in anchored.yml
- `references/task-file-schema.md` — task-file structure
