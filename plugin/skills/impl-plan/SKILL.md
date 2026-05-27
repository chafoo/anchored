---
name: impl-plan
description: |
  Brainstorm-mode skill — turns a raw task description into a draft
  task-file with phases + testable acceptance criteria + ALL ambiguities
  surfaced as priority-tagged structured questions. Reads (or creates)
  anchored.yml, runs code discovery (Explore), scans project conventions
  (rules agent), decomposes the work via the plan agent. Exits cleanly
  with status=drafted and open questions untouched — /impl-refine is
  where questions get walked with the user under the chosen autonomy
  level. Explicit-only trigger — the user types `/impl-plan <description>`.
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
| "Plan-agent surfaced 6 questions: 2 high, 3 medium, 1 low" | "Sechs sachen sind noch offen — 2 wichtige, 3 mittlere, 1 kleine. /impl-refine geht die mit dir durch." |
| "Status transition: plan → drafted complete" | "Plan steht. Run `/impl-refine` als nächstes." |

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
   | `status: plan`   | **Resume in-progress plan.** A previous `/impl-plan` started but exited before flipping to drafted. Re-read the task-file, finish any incomplete plan-agent work (missing phases, missing AC distributions), then flip to drafted. NO Q&A loop here — questions stay open for /impl-refine.    |
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

## Open questions stay open

In V0.3, `/impl-plan` does NOT run a Q&A loop with the user. The
plan-agent surfaces every ambiguity as a structured question via
`mcp__task__question_add` (with priority tags low/medium/high) and
those questions live in the task-file's `questions[]` array at
`status: 'open'`.

**You exit with the questions still open.** That's the expected
state for `drafted`.

`/impl-refine` is where the user gets walked through them — at its
**stage 0** the user picks an autonomy level (`ask_all` /
`ask_high_only` / `decide_all`), and at **stage 3** the orchestrator
resolves each open question either by asking the user or by letting
the AI decide (with `source='ai'` + `reasoning`) based on that
autonomy level.

So your job after the plan-agent finishes is just to:
1. Confirm the task-file parses (`mcp__task__read`)
2. Tally the open questions for the completion message
3. Flip status to `drafted`

No `AskUserQuestion` calls. No `task__question_resolve` calls. No
walking through anything. The brainstorm is done; refine takes it
from here.

### Why we moved Q&A out of plan

The V0.2 dogfood (2026-05-27) caught the failure mode: when /impl-plan
runs both the brainstorm AND the Q&A loop in one stretch, the
plan-agent develops a bias toward *deciding* ambiguities (so the
loop has less to walk through). That's the wrong incentive — we
want the agent to surface generously, not optimize for fewer
questions.

V0.3 splits the work: /impl-plan is brainstorm-only, /impl-refine
is decision-only. Each step has a single job, and the plan-agent
no longer feels pressure to pre-resolve anything.

### Tally for the completion message

After the plan-agent's MCP calls land, read the questions array:

```
const open = await mcp__task__question_list(
  project_root,
  slug,
  filter: { status: 'open' }
)
const high = open.filter(q => q.priority === 'high').length
const medium = open.filter(q => q.priority === 'medium').length
const low = open.filter(q => q.priority === 'low').length
```

Use those counts in the wrap-up message below.

## Wrap-up

When the plan-agent has landed all MCP calls (create + append_plan +
add_phase × N + question_add × M):

1. Run framework defaults (see below).
2. Verify the file parses: `mcp__task__read(project_root, slug)`.
3. Tally open questions (see "Tally for the completion message"
   above).
4. Call `mcp__task__set_task_status(project_root, slug, "drafted")`.
5. Return a summary message to the user with a **clickable link to the
   task-file** so they can review what was planned:

   ```
   Plan drafted → [.claude/tasks/<slug>.yml](.claude/tasks/<slug>.yml)

   N phasen, M ACs. K offene fragen (X high, Y medium, Z low).
   Status: plan → drafted.

   Run `/impl-refine` next — du wirst gefragt wie autonom du den
   run willst (alle fragen selbst beantworten, nur die wichtigen,
   oder alle der AI überlassen), dann läuft das durch plan-check
   + rules-check + Q&A-walk. Für trivial tasks kannst du refine
   skippen: `/impl-build` direkt (warnt + fragt einmal ob du
   sicher bist).
   ```

   The link is required — task-files can grow to hundreds of lines and
   the user needs a way to click in and review before committing to
   refinement or build. Use a relative markdown link so it renders as
   a clickable file reference in Claude Code.

   If K=0 (plan-agent surfaced no questions), still mention it
   explicitly — that's unusual and worth a confirmation prompt to
   the user ("Plan-agent hat keine fragen gestellt — sicher dass
   nichts unklar war? Sonst /impl-refine läuft direkt durch.")

## Framework defaults (always run)

- File-missing or `status: plan` → run the initial-create pipeline above.
  Any other existing status → branch into update-mode per the pre-flight
  table (never the initial-create pipeline on a populated file).
- Plan-agent owns initial structure: `context.intro`, `context.plan`,
  per-phase blocks, AND open questions — all land via
  `mcp__task__create` + `mcp__task__append_plan` + `mcp__task__add_phase`
  + `mcp__task__question_add`.
- Generate phase slugs from phase names (kebab-case).
- Every phase has ≥1 acceptance criterion. If plan-agent returns a
  phase with no ACs, that's an error — reject and ask for re-plan.
- Every AC starts with `status: 'pending'` and no `evidence` field.
  Plan-agent doesn't pre-fill — implement does, atomically with
  status transition.
- **Open questions stay open at the end of /impl-plan.** They do NOT
  block the status transition to `drafted`. /impl-refine handles
  resolution under the user's chosen autonomy level.
- Validate task-file integrity via `mcp__task__read` before
  the final status flip — if it fails to parse, something went
  wrong; surface the error to the user.

## References on demand

When you need to recheck format details:

- `references/task-file-schema.md` — task-file structure
- `references/default-config.yml` — what's in framework default
  `anchored.yml`
- `references/state-mutations.md` — MCP tool reference
