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

You are the orchestrator for the `/impl-plan` lifecycle phase. The
user invoked you with a raw task description (or pointed at an
existing draft task-file). Your job: produce a refined task-file
ready for `/impl-build` to drive.

This skill is **explicit-only**. The user typed `/impl-plan ...` —
there's no auto-triggering to worry about. Don't second-guess
whether they meant it; they did.

## Pre-flight

Run these checks before touching anything:

1. **Load `anchored.yml`** from the project root.
   - If it exists: parse it (yaml). Validate against schema (the MCP
     server validates on demand; call `mcp__anchored__task_read` on a
     dummy or just assume valid if it loads as YAML).
   - **If missing: lazy-init.** Tell the user: "I don't see an
     `anchored.yml` here. I'll create one from the framework defaults
     (`references/default-config.yml`). You can edit it later.
     Continue?" Wait for Y/n. If Y, copy
     `<plugin-root>/references/default-config.yml` to
     `<user-project>/anchored.yml`. If n, exit cleanly.
2. **Determine the task slug + path.**
   - If the user gave a path to an existing draft file
     (`.claude/tasks/<slug>.md`), parse the slug from the filename.
   - Otherwise, derive a slug from the user's task description
     (kebab-case, short, descriptive — e.g. "add OAuth device flow"
     → `add-oauth-device-flow`).
   - Target path: `<user-project>/.claude/tasks/<slug>.md`.
3. **State gate.**
   - If the file doesn't exist yet → proceed (creating from scratch).
   - If it exists, call `mcp__anchored__task_read(slug)` to get its
     current status:
     - `status: plan` → proceed (resuming or re-planning)
     - `status: build` / `wrap` / `done` → refuse with a clear message:
       "Task <slug> is already past plan stage (status: <status>).
       To re-plan, manually reset the file or delete it."

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
- RAW_PLAN, DISCOVERY, RULES_SUMMARY (from previous steps)
- PLAN_CONFIG: `anchored.yml.plan` (acceptance_criteria_defaults +
  instructions)

The plan agent returns a structured task-file blueprint. Persist it
via MCP:

```
mcp__anchored__task_read(slug)           # check if exists
# If not, create via the implicit "first context_append" behavior:
mcp__anchored__context_append(slug, "Context", null, <plan output's context>)
# For each plan_section entry from plan-agent:
mcp__anchored__context_append(slug, "Plan", null, <entry>)
# For each phase:
mcp__anchored__phase_create(slug, phase.slug, phase.name, phase.context, phase.rules, phase.acceptance_criteria)
```

(Exact op names per `docs/service-layer-architecture.md` — pick the
one that matches the action.)

## Q&A loop

Plan-agent surfaces open questions in `### Plan` with `→ ?` markers.
After the pipeline finishes:

1. Read all open questions from the task-file
   (`mcp__anchored__task_read`).
2. Split into blocking and non-blocking based on the `[blocking]` tag.
3. For each blocking question, ask the user via AskUserQuestion.
   Update the file: `→ ?` becomes `→ resolved: <answer>` (or
   `→ deferred: <reason>` if user says defer).
4. For non-blocking questions, batch ask (in chat, not
   AskUserQuestion) — user can answer in prose, you mark resolved.
5. Loop until no `→ ?` remains in `### Plan`.

If user gives "decide yourself" as an answer to any question, you
DO decide and mark `→ resolved: <your-decision> (decided by agent
per user permission)`.

## Wrap-up

When the pipeline + Q&A loop are clean:

1. Run framework defaults (see below).
2. Call `mcp__anchored__task_status_set(slug, "build")`.
3. Return a summary message to the user:
   > "Refined `<slug>`. N phases, M acceptance criteria. Status:
   > build. Ready for `/impl-build`."

## Framework defaults (always run)

- Refuse to run if existing `status` is anything but `plan` (or file
  missing).
- Initialize standard sections during creation: `## Context`, `## Phases`.
  H4 sub-sections like `### Build → #### Implement` are on-demand
  (only appear when content gets written there).
- Generate phase slugs from phase names (kebab-case in the HTML
  comment).
- Every phase has ≥1 acceptance criterion. If plan-agent returns a
  phase with no ACs, that's an error — reject and ask for re-plan.
- Every AC starts with `evidence: —`. Plan-agent doesn't pre-fill.
- Open questions are resolved or explicitly deferred before status
  transitions to `build`.
- Validate task-file integrity via `mcp__anchored__task_read` before
  the final status flip — if it fails to parse, something went
  wrong; surface the error to the user.

## References on demand

When you need to recheck format details:

- `references/task-file-schema.md` — task-file structure
- `references/default-config.yml` — what's in framework default
  `anchored.yml`
- `references/evidence-format.md` — what good evidence looks like
- `references/state-mutations.md` — MCP tool reference
