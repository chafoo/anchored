---
name: impl-plan
description: |
  Refine a raw task description into a structured task-file with phases
  and testable acceptance criteria. Reads (or creates) anchored.yml,
  runs code discovery (Explore), scans project conventions (rules
  agent), decomposes the work via the plan agent, and runs a Q&A loop
  on blocking questions before transitioning task status `plan → build`.
  Explicit-only trigger — the user types `/impl-plan <description>`.
---

# /impl-plan

## Communication style

See `plugin/references/communication-style.md` for the full principle —
anchored speaks like a pair-programmer partner, not an automation
engine. Tool names, factory calls, retry counters stay out of chat
(visible in audit + verbose mode, invisible in dialog).

Skill-specific:

| Avoid (machinery voice) | Prefer (partner voice) |
|---|---|
| "Spawning plan-agent with task description..." | "Lass uns das durchsprechen — was genau willst du bauen?" |
| "Q&A loop: 3 markers detected, processing..." | "Drei sachen sind noch unklar im plan. Lass uns die kurz klären." |
| "Status transition: plan → drafted complete" | "Plan ist soweit. Run `/impl-refine` als nächstes." |

You are the orchestrator for the `/impl-plan` lifecycle phase. The
user invoked you with a raw task description (or pointed at an
existing draft task-file). Your job: produce a refined task-file
ready for `/impl-build` to drive.

This skill is **explicit-only**. The user typed `/impl-plan ...` —
there's no auto-triggering to worry about. Don't second-guess
whether they meant it; they did.

## Pre-flight

Run these checks before touching anything. **Stay silent about steps
that succeed without user input** — only narrate when something needs
the user's attention (missing config, refused state gate, etc.).

1. **Load `anchored.yml`** from the project root.
   - If it exists: parse it silently. Don't mention it in chat — the
     user knows their config is there. Only surface anchored.yml if
     it fails to parse (in which case: tell the user the parse error
     + line number, exit).
   - **If missing: lazy-init.** Tell the user: "I don't see an
     `anchored.yml` here. I'll create one from the framework defaults
     (`references/default-config.yml`). You can edit it later.
     Continue?" Wait for Y/n. If Y, copy
     `<plugin-root>/references/default-config.yml` to
     `<user-project>/anchored.yml`. If n, exit cleanly.
2. **Determine the task slug + path.**
   - If the user gave a path to an existing draft file
     (`.claude/tasks/<slug>.yml`), parse the slug from the filename.
   - Otherwise, derive a slug from the user's task description
     (kebab-case, short, descriptive — e.g. "add OAuth device flow"
     → `add-oauth-device-flow`).
   - Target path: `<user-project>/.claude/tasks/<slug>.yml`.
3. **State gate + update-mode branch.** `/impl-plan` is the one entry
   point that can revisit an existing task — it branches on the
   current status. The seven cases:

   | Pre-flight state | /impl-plan behavior                                                                                                                                         |
   |------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
   | file missing     | **Initial-create.** Run the pipeline below (Explore → rules → plan) from scratch.                                                                            |
   | `status: plan`   | **Resume refinement loop.** A previous `/impl-plan` started but didn't finish the Q&A. Re-read open questions and continue from where it left off.          |
   | `status: drafted`| **Update-mode.** Read the plan, ask the user what to change, apply via MCP ops. Status stays `drafted` (no flip needed — it's already there).                |
   | `status: refined`| **Update-mode + flip-back-to-drafted.** BEFORE applying any edits, flip status `refined → drafted` so `/impl-refine` re-fires after. Then apply edits.       |
   | `status: build`  | **Update-mode + done-phase guard + flip back.** Pending / in-progress phases edit freely. Done phases require explicit per-change confirmation (AskUserQuestion) — see below. After edits, flip `build → drafted`. |
   | `status: wrap`   | **Same as `build`** — done-phase guard + flip `wrap → drafted` after edits.                                                                                  |
   | `status: done`   | **Confirm reopen first.** AskUserQuestion: "Task is done. Re-open for changes?" If confirmed: flip `done → drafted`, then enter update-mode (same behavior as `build`/`wrap`). If declined: exit cleanly. |

   The backward edges `{refined, build, wrap, done} → drafted` are the
   ONLY backward transitions Anchored allows. They exist solely for
   this skill — see `references/state-mutations.md` "Update-mode: the
   backward-transition exception" for the rationale.

## Update-mode workflow

When pre-flight lands on any of the update-mode branches (drafted /
refined / build / wrap / done-after-confirm), follow this sequence
instead of the initial-create pipeline below:

### 1. Read the current task-file

```
mcp__task__read(project_root, slug)
```

### 2. Present a short summary (3–5 lines)

Tell the user what they have:

> Task **<title>** — <N phases (M done, K pending), L ACs total, current status: <status>>.

### 3. Ask what they want to change

Use `AskUserQuestion` with options:

- **Discuss only** — chat about the plan, no mutations
- **Tweak text or ACs** — add/remove/edit individual ACs or phase fields
- **Restructure phases** — reorder, split, merge, add/remove phases
- **Cancel** — exit without changes

### 4. Branch on the answer

- **Discuss only** → respond conversationally about whatever the user
  asked. Do not call any mutation MCP ops. Exit at end of conversation
  (the user can re-run `/impl-plan` later to actually mutate).

- **Tweak text or ACs** → use the matching MCP ops directly:
  - Add an AC → `mcp__task__add_ac(slug, phase_slug, { text })`
  - Remove an AC → `mcp__task__remove_ac(slug, phase_slug, idx)`
  - Edit AC text → `mcp__task__set_ac_text(slug, phase_slug, idx, text)`
  - Edit phase context / rules → `mcp__task__set_phase_context`,
    `mcp__task__set_phase_rules`
  - Confirm each individual change with the user BEFORE writing
    (small AskUserQuestion: "Apply this change? Y/n"). This keeps
    the user in the loop on additive edits without spamming.

- **Restructure phases** → spawn `plan-agent` (`plugin/agents/plan.md`)
  with the existing task-file + the user's change request as input
  (plan-agent has a documented "restructure existing plan" input mode).
  The agent returns a structured plan-diff:

  ```
  [
    {op: 'add_phase', position: {after: 'foo'}, phase: {...}},
    {op: 'remove_phase', slug: 'bar'},
    {op: 'move_phase', slug: 'baz', position: {to: 'end'}},
    {op: 'set_phase_name', slug: 'qux', name: 'New Name'},
    ...
  ]
  ```

  Present the diff to the user (`AskUserQuestion`: "Apply this plan
  diff?"). On confirmation, apply each op via the matching MCP call:
  - `add_phase` → `mcp__task__add_phase(slug, phase_init, position)`
  - `remove_phase` → `mcp__task__remove_phase(slug, phase_slug)`.
    **If the phase is done**, the factory throws
    `DonePhaseImmutable` — surface the message to the user and
    AskUserQuestion: "Phase '<name>' is done with evidence. Force
    remove (loses evidence)?" Only if yes, retry with
    `mcp__task__remove_phase(slug, phase_slug, { force: true })`.
  - `move_phase` → `mcp__task__move_phase(slug, phase_slug, position)`
  - `set_phase_name` → `mcp__task__set_phase_name(...)`

### 5. Done-phase preservation guard

When the task is at `status: build` / `wrap` / `done`, some phases
already have `status: done` with real evidence (file:line refs,
commit SHAs, test runs). Removing or restructuring those phases
discards proven work.

For ANY edit that touches a done phase (remove, rename, AC mutation),
AskUserQuestion: "Phase '<name>' is done with evidence: <show the
evidence list>. Apply this change anyway?" Default: no.

The factory's `DonePhaseImmutable` error backs this guard at the
service-layer — even if the skill forgets the prompt, `remove_phase`
without `{ force: true }` will throw on a done phase. The skill's
job is the FRIENDLY prompt; the factory is the safety net.

### 6. Append an audit entry to `context.plan`

After all edits land, append a one-line audit entry via
`mcp__task__append_plan(project_root, slug, content)`:

```
Updated 2026-05-27: added 'input validation' AC to phase 2; restructured phase 4 into A+B
```

Use today's ISO date and a terse one-line summary of what changed.
This keeps the plan section a chronological log of intent.

### 7. Status transition back to drafted

If pre-flight detected the task above `drafted` (`refined`, `build`,
`wrap`, or `done` after the re-open confirmation), call:

```
mcp__task__set_task_status(project_root, slug, 'drafted')
```

This ensures `/impl-refine` re-validates the modified plan against
current code + rules before the next `/impl-build` attempt. Skipping
this would let stale `refined` status hide planning changes that
might affect refinement findings.

If pre-flight was already at `drafted`, this step is a no-op (the
factory accepts `drafted → drafted` as a self-edge).

## Pipeline

Run each step from `anchored.yml.plan.steps` in declaration order
(top-to-bottom in the user's config file).

For the default pipeline (`explore` → `rules` → `refine`):

### Step: explore
Spawn Claude Code's built-in `Explore` agent with the raw task
description. Capture its return as the discovery summary
(affected_paths, similar_code, patterns). If user's anchored.yml has
`plan.steps.explore.instructions` prose, append it to the agent's
brief.

### Step: rules
Spawn the `rules` agent (`plugin/agents/rules.md`) with:
- RAW_PLAN: user's task description
- DISCOVERY: output from explore step
- RULES_CONFIG: `anchored.yml.plan.rules` (paths, additional_keywords)

Capture the rules summary (must_follow + worth_knowing + sources).

### Step: refine
Spawn the `plan` agent (`plugin/agents/plan.md`) with:
- PROJECT_ROOT: absolute path to the user's project root
- TASK_SLUG: the slug
- RAW_PLAN, DISCOVERY, RULES_SUMMARY (from previous steps)
- PLAN_CONFIG: `anchored.yml.plan` (acceptance_criteria_defaults +
  instructions)

The plan agent calls `mcp__task__create` to author the initial
task-file, then `mcp__task__append_plan` for the Plan section, then
`mcp__task__add_phase` once per phase. There is no longer a bootstrap
Write exception — every mutation, including initial creation, goes
through the MCP factory (which validates schema + atomic-writes).

After the plan agent returns, verify the file was created:

```
mcp__task__read(project_root, slug)
```

If `task__read` fails with NotFound, the plan-agent's MCP sequence
didn't complete — surface the agent's structured output to the user
along with the error and consider re-spawning. If the file exists
but is malformed (parser throws), surface the error to the user.

## Q&A loop

Plan-agent surfaces open questions in `context.plan` with `→ ?`
markers. Each question is either `[blocking]` (planning can't proceed
without an answer) or non-blocking (a default exists, but multiple
reasonable interpretations are possible).

After the pipeline finishes, run this sequence:

### 1. Read all open questions
Use `mcp__task__read` to inspect the file. Extract every `Q: ...`
entry and its `→ ?` marker. Split into:
- `blocking`: tagged `[blocking]` — must be resolved
- `non-blocking`: has a proposed default — could be auto-resolved

Track each question's **0-based index** in the order they appear in
`context.plan` — that's the `q_index` you'll pass to
`mcp__task__resolve_question`.

### 2. Always resolve blocking questions interactively
For each blocking question, ask the user via `AskUserQuestion`.

**Resolve via `mcp__task__resolve_question`, not Edit.** V0.2 retired
the Edit bootstrap exception — there is now a typed service-layer op
that replaces the n-th `→ ?` marker in place. Call:

```
mcp__task__resolve_question(
  project_root,
  slug,
  q_index,
  resolution = "resolved: <answer> (confirmed by user, <YYYY-MM-DD>)"
)
```

or for deferrals:

```
mcp__task__resolve_question(
  project_root,
  slug,
  q_index,
  resolution = "deferred: <reason> (confirmed by user, <YYYY-MM-DD>)"
)
```

The factory replaces the matching `→ ?` line in place, validates the
file still parses, and atomic-writes. Throws
`RefinementMarkerNotFound` if `q_index` is out of range — re-read
the file and recount if you see that.

Do NOT append a separate "Question resolutions" section at the
bottom of `context.plan` — that creates a duplicate audit trail and
requires a clean-up pass. Replace-in-place keeps the Plan section
chronologically readable.

### 3. Triage non-blocking questions with one upfront prompt
If there are any non-blocking questions, ask the user ONCE up front
how they want to handle them, using `AskUserQuestion`:

> "Found N non-blocking ambiguities in the ticket. I have proposed
> defaults for each. How do you want to handle them?"
>
> Options:
> - "Walk through each — I'll show you the question and proposed
>   default, you confirm or override" (recommended for unfamiliar
>   work / first task)
> - "Auto-resolve with my proposed defaults — proceed without
>   further interruption" (recommended for routine work / when
>   you trust the defaults)

After their choice:
- **Walk-through**: ask each non-blocking via `AskUserQuestion`, show
  the proposed default as the first option, user picks or overrides.
  Resolve each via `mcp__task__resolve_question` (same in-place
  replacement pattern as blocking questions above) with
  `resolved: <answer> (confirmed by user, <date>)`.
- **Auto-resolve**: silently apply each proposed default. Resolve
  each via `mcp__task__resolve_question` with
  `resolved: <default> (auto-resolved per user permission, <date>)`
  so the trail shows the user opted in to letting the agent decide.

In both modes: use `mcp__task__resolve_question` for the replacement
— never Edit. Same reasoning as above (inline replace, no duplicate
sections) plus V0.2's no-bootstrap-exceptions design.

**Index re-use caveat:** `q_index` refers to the n-th `→ ?` marker
in the CURRENT file. After you resolve question 0, question 1
becomes the new "first `→ ?`" — i.e. q_index 0 in the next call. The
safest pattern is to resolve in REVERSE order (highest index first)
so earlier indices stay stable. Alternatively, re-count via
`mcp__task__read` between each call.

### 4. Verify the file is clean
After Q&A resolves, re-read the task-file. No `→ ?` markers should
remain in `context.plan`. If any do, return to step 2/3 for them.

### 5. Fallback: "decide yourself" on individual questions
If during walk-through the user answers "decide yourself" for a
specific question, treat that question as auto-resolved and proceed.
Resolve with `resolved: <decision> (decided by agent per user permission)`.

## Wrap-up

When the pipeline + Q&A loop are clean:

1. Run framework defaults (see below).
2. Call `mcp__task__set_task_status(project_root, slug, "drafted")`.
3. Return a summary message to the user with a **clickable link to the
   task-file** so they can review what was planned:

   ```
   Plan drafted → [.claude/tasks/<slug>.yml](.claude/tasks/<slug>.yml)

   N phases, M acceptance criteria, K open questions resolved.
   Status: plan → drafted.

   Run `/impl-refine` next to validate against current code + apply
   architecture preferences, then `/impl-build` to execute. For
   trivial tasks you can skip refinement: `/impl-build` directly
   (the skill warns + asks for confirmation).
   ```

   The link is required — task-files can grow to hundreds of lines and
   the user needs a way to click in and review before committing to
   refinement or build. Use a relative markdown link so it renders as
   a clickable file reference in Claude Code.

## Framework defaults (always run)

- File-missing or `status: plan` → run the initial-create pipeline above.
  Any other existing status → branch into update-mode per the pre-flight
  table (never the initial-create pipeline on a populated file).
- Plan-agent owns initial structure: `context.intro`, `context.plan`,
  and per-phase blocks land via `mcp__task__create` +
  `mcp__task__append_plan` + `mcp__task__add_phase`.
- Generate phase slugs from phase names (kebab-case).
- Every phase has ≥1 acceptance criterion. If plan-agent returns a
  phase with no ACs, that's an error — reject and ask for re-plan.
- Every AC starts with `status: 'pending'` and no `evidence` field.
  Plan-agent doesn't pre-fill — implement does, atomically with
  status transition.
- Open questions are resolved or explicitly deferred before status
  transitions to `drafted` / `build`.
- Validate task-file integrity via `mcp__task__read` before
  the final status flip — if it fails to parse, something went
  wrong; surface the error to the user.

## References on demand

When you need to recheck format details:

- `references/task-file-schema.md` — task-file structure
- `references/default-config.yml` — what's in framework default
  `anchored.yml`
- `references/state-mutations.md` — MCP tool reference
