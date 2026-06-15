---
name: plan
description: Brainstorm a raw task description into a drafted plan with phases + testable acceptance criteria by orchestrating the plan agents in-session. Triggers ONLY on the explicit `/a:plan <epic|task|phase>? <description>` command. Decomposes the work and surfaces open questions; classifies the tier when omitted. Use for `/a:plan`, not for general planning chatter.
---

# /a:plan — fractal plan stage (skill-orchestrated)

Explicit-only: the user typed `/a:plan <tier?> <description>`.

## Communication style

Partner voice in chat, machinery only in the audit trail — see
`plugin/references/communication-style.md`:

| Avoid (machinery) | Prefer (partner) |
|---|---|
| "anchored epic plan … → node created (status plan)" | "Setting up the epic for `<slug>`." |
| "Spawning discover + decompose…" | "Let's talk it through — what exactly should go in?" |
| "running the two plan steps: discover then scaffold (stubs + dependency order)" | "I'll skim the code and sketch the two tasks." |
| "status flip plan → drafted" | "Plan's ready — N phases, M acceptance criteria, K open questions. Run `/a:refine`." |

**Before every user-facing line**, apply the jargon mapping from
`communication-style.md` — framework terms (scaffold, stub, seam, grounding,
roll-up, outcome acceptance criteria, execute, the each-loop, drafted/refined,
concern, dependency graph, just-in-time) never belong in chat, only their plain
words.

The skill is the **orchestrator**: it consults the `anchored` CLI for the
step-plan + node ops and spawns each plan agent itself via the **Task tool**. The
agents self-write phases/acceptance criteria via the tier-first CLI (see
`plugin/references/agent-contract.md`). The CLI never spawns agents — a headless
subprocess can't reach the session's Task tool.

## Classify the tier (when omitted)

If the user gave an explicit `epic|task|phase`, use it. Otherwise probe the scope
and apply the tripwire (fractal-redesign Item 1): `<5` phases → `task`, `5–9` →
independence test (does each unit need its own plan→refine→build→wrap?), `≥10` →
`epic`. Surface the recommendation, confirm via `AskUserQuestion`, then proceed.
This routing lives only in the skill — no `classify` step, no `classify` agent.

## Get the orchestration plan + create the node

```bash
anchored <tier> create <short-slug> "<title>"   # creates the node (status plan), does NOT spawn
anchored <tier> plan <short-slug>                # → { steps, node }   (returns the step-plan, does NOT spawn)
```

**Always create with a short, explicit slug.** Derive a 2–3-word kebab slug from the
gist (`add OAuth device flow` → `oauth-device-flow`, not the whole sentence). If you
slugify the *entire description* you get an unwieldy name like
`tasks-app-test-lauf-kleiner-epic-mit-genau-zwei` — which then shows up in every later
command, the branch `task/<slug>`, and the task-file. The slug is the node's stable
handle for its whole life; pick it deliberately. Never `rm` a long auto-slug and
recreate — pass the right slug to `create` from the start.

**Re-planning an existing node:** when the user re-plans a slug that already exists
(refining the brief, restarting the plan stage), do not re-`create` — run
`anchored <tier> plan <existing-slug>` to **reuse the same node**. This keeps the
node's provenance (log, questions, created date, prior context). Do **not** `rm` the
task-file and recreate it: that throws away the history and the slug stability the rest
of the lifecycle (branches `task/<slug>`, archive/reset) depends on. Re-running `plan`
on the existing slug is the supported re-plan path; deleting + recreating is not.

**Onboarding (no `anchored.yml` yet, G13):** a missing `anchored.yml` is fine — the
CLI lazy-inits a minimal one (deltas-only = all defaults) + the `Bash(anchored *)`
allowlist on first use, so planning proceeds immediately. The FIRST time you see a
project with no prior `anchored.yml`, after the node is created, mention in **one
line** that anchored is running on defaults and offer to tune it together — a
single `AskUserQuestion`: *"Want to tailor anchored to your project now (test/lint
command, commit-per-phase, …) or just the essentials for now?"* → **Set it up now**
routes to the `setup` skill; **just the essentials** proceeds with defaults (`/a:setup`
is there later). Partner voice, no funnel — never block planning on it.

`steps` is the resolved plan-stage
pipeline: for a task `[discover, rules-scan, decompose]`, for an epic
`[discover, scaffold]`.

## Spawn each step's agent (Task tool, in order)

For each worker step in `steps`, spawn its `agent` via the Task tool with the
agent-contract input `{ task-slug: <node.slug>, tier, stage: plan, context, rules,
instructions }`:

- **discover → plan-discover** — scans the codebase; self-writes findings:
  `anchored <tier> append-log <slug> plan learning "<affected paths / patterns>"`.
- **rules-scan → plan-rules-scan** — collects applicable `.claude/rules/`:
  `anchored <tier> append-log <slug> plan learning "<relevant rules>"`.
- **decompose → plan-decompose** (task) — writes phases + testable acceptance
  criteria: `anchored task add-phase <slug> <phase-slug> "<name>"` then
  `anchored phase ac-add <slug>/<phase-slug> "<testable acceptance criterion>"` (id auto-assigned).
- **scaffold → epic-scaffold** (epic) — coarse task stubs:
  `anchored epic child-add <slug> <task-stub-slug>` (dependency order via depends_on).

## Custom run/use steps (the config's own steps — research, scaffolding, …)

`anchored <tier> plan <slug>` returns the FULL config-driven plan, not just the
known workers. A user can extend the plan stage with their own steps (e.g. a
web-research step that writes its result into a custom field) — dispatch them in
declaration order, at the position they sit in the plan:

- **`kind: 'run'`** — a shell command from `anchored.yml`. **YOU execute it via
  Bash**, with the variable contract below as real environment variables (never
  hand-substitute). A run-step that fails (non-zero) is a real failure — surface it
  and stop, don't flip to drafted.
- **`kind: 'use'`** — spawn the named subagent (or, with `type: skill`, invoke the
  skill) with the step's `instructions`. A research worker, for example, writes its
  result back into a declared custom field via the CLI:
  `anchored <tier> set <slug> research "<findings>"` (the field must be declared
  under that tier's `fields` — a custom field validates since the custom-field fix).

**Variable contract (every plan run-step gets these as env vars):**

| Variable | Value |
|---|---|
| `TASK_SLUG` | the node being planned (its slug) |
| `EPIC_SLUG` | the parent epic slug, or empty when not in an epic |

Run a `run`-step as e.g. `TASK_SLUG='<slug>' EPIC_SLUG='' bash -c "$STEP_RUN"`.
Keep the plumbing out of chat — narrate the outcome ("Research's done — result's in
the research field."), not the command.

Surface generously: any ambiguity the decompose agent hits becomes an open
question (`anchored <tier> question-add <slug> "<q>" high`), NOT a silent decision —
`/a:refine` walks them. Every question carries a worked-out recommendation + 1–3
implication bullets in its text (`plugin/references/question-style.md`) — never a
bare question. The same applies to **every `AskUserQuestion` this skill itself
raises** (the tier-classification confirm, the onboarding offer): recommended
option first (`(Recommended)`), implications named.

## Failure-handling

If an agent returns nothing or errors, do NOT flip to drafted — surface what
failed and let the user re-run; a half-decomposed plan is worse than a clear
failure. Only flip when the structure is actually written.

## Finish

Write the plan-trail prose (intro + the discover/decompose summary) to the node's
own context, then flip the status:
```bash
anchored <tier> set <slug> context.plan "<intro + the plan-trail summary>"
anchored <tier> status <slug> drafted
```
(`set` supports the dotted path — `context.plan` is set nested.) Tell the
user: *"Plan's ready — N phases, M acceptance criteria, K open questions. Run `/a:refine`
next."* No MCP, no raw node-file edit.
