---
name: impl-refine
description: |
  Engineering-review skill — picks an ephemeral walk-style, validates a
  drafted plan against current code + rules, walks every open question
  with the user (or AI, per the chosen walk-style), then applies
  user-defined architecture preferences. Use after /impl-plan to validate
  the plan before /impl-build. Spawns plan-check + rules-check (mandatory
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
| "Walk-mode = high-together" | "Okay — die wichtigen kläre ich mit dir, den rest mach ich selbst." |
| "Spawning plan-check + rules-check gates in parallel..." | "Lass mich den plan kurz gegen den aktuellen code-stand prüfen." |
| "Stage 3: resolving question q4 via user input" | "Toggle-pattern — whole-row click oder dedicated checkbox?" |
| "Status transition: drafted → refined" | "Plan ist refined. Run `/impl-build` als nächstes." |
| "Keine custom refine.steps in anchored.yml → Stage 4 skip. Stage 5: flip auf refined." | (silent — just flip the status and move to completion message) |
| "Stage 4 (custom steps): empty → skipping" | (silent — empty stages need no narration) |
| "Reading anchored.yml.refine.steps[]" | (silent — config-loading is plumbing) |
| "Calling mcp__task__set_task_status..." | (silent — show the OUTCOME, not the call) |

**Hard rule on machinery leakage:** "Stage N", "anchored.yml.<slot>",
"calling task__...", "skip step", "flip status" are all internal flow
control. The user picked a walk-style + answered (or delegated)
questions; they don't need to track the orchestrator's bookkeeping.
Empty stages, config reads, MCP calls, status flips → SILENT. Only the
outcome and decisions worth surfacing reach chat.

If you find yourself reaching for a sentence that names a Stage
number, a config slot, or an MCP tool — that's a tell: rephrase as
the human-meaningful outcome or drop the line entirely.

## Task-file mutation contract

**All task-file mutations go through MCP, only from this SKILL
context.** Plugin custom subagents (plan-check, rules-check) return
structured output; YOU apply via `mcp__task__*` calls. Never use
`Write` or `Edit` on `.claude/tasks/<slug>.yml` — the factory owns
schema validation, state-machine enforcement, atomic writes, and
the yaml-language-server directive (renderer auto-injects on every
write). See `references/state-mutations.md`.

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
Stage 0 — walk-style choice       (ephemeral — never persisted)
Stage 1 — plan-check              (mandatory gate, no Q&A here)
Stage 2 — rules-check             (mandatory gate, no Q&A here)
Stage 3 — consolidated Q&A walk   (priority-aware)
Stage 4 — custom user steps
Stage 5 — status transition (drafted → refined)
```

### Stage 0 — walk-style choice

This is where the user picks **how this one Q&A walk runs** — whether
they answer every question, only the important ones, or hand all the
calls to the AI. The choice is **purely ephemeral**: it lives only for
this refine session, drives only Stage 3's walk, and is **never written
to the task-file**. There is no `task.autonomy` field — it was removed.
If the user re-runs `/impl-refine` later, they just pick again; nothing
about the choice persists or affects the later build.

The three walk-styles:

- **AI-all** — the AI decides every open question itself (each resolved
  `source='ai'` with reasoning). Lowest-friction; good for low-stakes
  tasks / vibe coding.
- **high-together** — the AI walks the high-priority questions WITH the
  user; medium + low it decides itself. The balanced default.
- **all-together** — every open question is walked with the user.

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

2. **If `open.length === 0`**: no questions to walk. Default the
   walk-style to `high-together` silently and skip to Stage 1. Mention
   in the completion message that the plan-agent surfaced no questions.

3. **Otherwise**, ask the user via `AskUserQuestion`:

   > "Es gibt {open.length} offene fragen — {high} high, {medium} medium, {low} low. Wie wollen wir die durchgehen?"
   >
   > Options:
   > - "Alle gemeinsam durchgehen" (walk-style = `all-together`)
   > - "Nur die wichtigen (high), rest entscheidest du" (walk-style = `high-together`) (recommended for medium/high mix)
   > - "Du entscheidest alles — ich vertraue dir" (walk-style = `AI-all`) (recommended for low-stakes tasks / vibe coding)

   Adapt option count to question distribution:
   - If `low === 0` and `medium === 0`: only show `all-together` vs
     `AI-all` (the `high-together` option is identical to `all-together`
     when all questions are high)
   - If `high === 0` and `medium === 0`: only show `all-together` vs
     `AI-all` (everything is low, no priority bucket to filter by)
   - Otherwise: show all three

4. Hold the chosen walk-style in-memory for this refine session. It is
   **ephemeral** — never persisted to the task-file, never written as a
   field.

5. Confirm to the user in pair-programmer voice ("Okay, die
   wichtigen kläre ich mit dir, den rest mach ich selbst.")

### Stage 1 — plan-check (mandatory gate, parallel-safe)

**Read the current task-file first** (`mcp__task__read(project_root,
slug)`) so you can pass its content to plan-check (V0.3.1: plugin
subagents can't access MCP — bug #13605 workaround — so you
pre-read and pass content).

Spawn the `plan-check` agent (`plugin/agents/plan-check.md`) with:
- PROJECT_ROOT: absolute path to the user's project root
- TASK_SLUG: the slug
- TASK_FILE_CONTENT: the YAML you just read
- USER_EXTENSION: `anchored.yml.refine.plan_check.instructions` prose
  (appended to the agent's default brief; may be empty)

The plan-check agent is a **pure thinker**:
- Reads TASK_FILE_CONTENT + inspects code via Read/Glob/Grep
- Detects drift, structural issues, hidden unilateral defaults
- Returns a structured rollup (`verdict`, `auto_fixes`,
  `questions_to_add`, `retags`, `partner_voice_summary`)
- Does NOT call MCP — that's your job

**After plan-check returns, YOU apply its findings via MCP:**

1. For each `auto_fixes.path_patches[i]`:
   `mcp__task__set_phase_context(project_root, slug, phase_slug, new_context)`

2. For each `auto_fixes.rule_additions[i]`:
   `mcp__task__set_phase_rules(project_root, slug, phase_slug, rules)`
   (agent provides FULL list; SKILL passes it wholesale)

3. For each `auto_fixes.info_notes[i]`:
   `mcp__task__append_plan(project_root, slug, content)`

4. For each `questions_to_add[i]`:
   `mcp__task__question_add(project_root, slug, { text, priority,
   origin: 'plan-check', phase? })`

5. For each `retags[i]`:
   `mcp__task__question_retag(project_root, slug, id, priority)`

6. Write the rollup to `context.build → plan-check` for the audit
   trail:
   `mcp__task__append_build_section(project_root, slug, 'plan-check',
   rollup_summary)` where `rollup_summary` is a markdown rendering
   of the verdict + counts.

**No Q&A here.** Open questions accumulate; they get walked in
Stage 3.

### Stage 2 — rules-check (mandatory gate, parallel-safe)

Spawn the `rules-check` agent (`plugin/agents/rules-check.md`) with:
- PROJECT_ROOT, TASK_SLUG
- TASK_FILE_CONTENT: same pre-read YAML you passed to plan-check
- USER_EXTENSION: `anchored.yml.refine.rules_check.instructions` prose

The rules-check agent is a **pure thinker**:
- Inspects rules-coverage per phase (does each phase's affected paths
  trigger any `.claude/rules/*.md` that aren't attached?)
- Detects orphaned rule references (path no longer exists on disk)
- Detects cross-phase rule conflicts (same path with incompatible rule
  imperatives)
- Returns structured rollup (`verdict`, `auto_fixes.rule_additions`,
  `questions_to_add`, `retags`, `partner_voice_summary`)
- Does NOT call MCP

**After rules-check returns, YOU apply its findings via MCP:**

1. For each `auto_fixes.rule_additions[i]`:
   `mcp__task__set_phase_rules(project_root, slug, phase_slug, rules)`

2. For each `questions_to_add[i]`:
   `mcp__task__question_add(project_root, slug, { text, priority,
   origin: 'rules-check', phase? })`

3. For each `retags[i]`:
   `mcp__task__question_retag(project_root, slug, id, priority)`

4. Write rollup to `context.build → rules-check`:
   `mcp__task__append_build_section(project_root, slug,
   'rules-check', rollup_summary)`

**No Q&A here.** Same as Stage 1 — questions accumulate for Stage 3.

### Stage 3 — consolidated priority-aware Q&A walk

This is where every open question (from the plan-agent's brainstorm
PLUS plan-check's additions PLUS rules-check's additions) gets
resolved in one consolidated pass. The ephemeral walk-style chosen at
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

2. Determine the **ask threshold** from the ephemeral walk-style held
   in-memory from Stage 0 (NOT read from the task-file — it isn't
   stored there):

   ```
   // walkStyle is the in-memory choice from Stage 0
   const asksThisPriority = (priority) => {
     if (walkStyle === 'all-together')  return true
     if (walkStyle === 'AI-all')        return false
     // high-together
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
   can pick a different walk-style if their initial choice was wrong,
   then Stage 3 walks only the still-open questions.

5. **Override the walk-style mid-walk.** If the user says "actually,
   let me decide the rest" or "actually, you decide the rest"
   during the walk, update the in-memory walk-style and continue
   the walk from where you were (the new value applies on the next
   iteration). The walk-style is ephemeral — nothing is persisted.

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
2. Call `mcp__task__set_task_status(project_root, slug, "refined")`.
   The factory atomically flips status `drafted → refined`.
3. Tell the user (see Completion message below).

The transition is **atomic** — status only flips to `refined` if
everything above succeeded.

## Abort + resume semantics

- **Ctrl+C anywhere mid-pipeline** → status STAYS at `drafted`.
  Partial auto-fixes by plan-check / rules-check are preserved
  (each MCP op is atomic). Already-resolved questions stay
  resolved. (The walk-style was only ever in-memory — nothing about
  it persists across runs.)
- **Re-running `/impl-refine`** picks up from Stage 0. The user
  gets re-asked the walk-style choice — they can pick differently if
  it didn't work out. plan-check + rules-check fire fresh (idempotent
  in practice; if everything's clean, they surface no new questions).
  Stage 3 walks only the still-open questions (already-resolved ones
  are skipped via the status filter).
- **User aborts during Stage 3 Q&A walk** → same: status stays
  drafted, resolved-so-far questions preserved. Re-run to resume.

## Completion message

When Stage 5 succeeds, tell the user. The shape depends on the
walk-style chosen + question distribution:

**Full all-together path** (user answered everything):

> Plan refined. Status: drafted → refined.
>
> Plan-check + rules-check liefen sauber durch (N + M auto-fixes).
> Wir sind {Q} fragen gemeinsam durchgegangen.
>
> Next: `/impl-build` startet die phase-execution.

**Hybrid high-together path** (user answered high, AI answered the rest):

> Plan refined. Status: drafted → refined.
>
> Plan-check + rules-check liefen sauber durch (N + M auto-fixes).
> Du hast {high} wichtige fragen geklärt, ich hab {medium+low}
> selbst entschieden (im plan-trail mit reasoning festgehalten,
> bei /impl-wrap kannst du das nochmal reviewen).
>
> Next: `/impl-build` startet die phase-execution.

**Full AI-all path** (AI answered everything):

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
> Plan-agent hatte keine fragen — nichts zu walken.
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
- ALWAYS run Stage 0 — the ephemeral walk-style choice is
  framework-fixed (but the choice itself is never persisted).
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
  AND no questions remain open.

## References on demand

When you need to recheck format details:

- `references/state-mutations.md` — MCP tool reference (the full
  mutation surface plan-check / rules-check / refine pipeline use)
- `references/default-config.yml` — what's configurable under
  `refine.*` in anchored.yml
- `references/task-file-schema.md` — task-file structure
