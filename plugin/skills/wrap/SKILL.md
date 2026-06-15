---
name: wrap
description: Finalize an anchored node whose build is complete — orchestrate review + summarize (leaf/task) or roll-up (epic) in-session. Triggers ONLY on the explicit `/a:wrap <slug>` command. Use for `/a:wrap`, not for general "wrap up" requests.
---

# /a:wrap — fractal wrap stage (skill-orchestrated)

Explicit-only: the user typed `/a:wrap <slug>`.

## Communication style

Partner voice in chat, machinery only in the audit trail — see
`plugin/references/communication-style.md`:

| Avoid (machinery) | Prefer (partner) |
|---|---|
| "Spawning wrap-review + summarize…" | "One last pass — I'll review the whole thing again." |
| "set-field context.wrap written" | (nothing — the summary IS the receipt) |
| "status flip wrap → done" | "Done. All green — here's the summary." |

**Before every user-facing line**, apply the jargon mapping from
`communication-style.md` — framework terms (scaffold, stub, seam, grounding,
roll-up, outcome acceptance criteria, execute, the each-loop, drafted/refined,
concern, dependency graph, just-in-time) never belong in chat, only their plain
words.

The skill is the **orchestrator**: it consults the `anchored` CLI for the
step-plan + node ops and spawns the wrap agents itself via the **Task tool**
(agents self-write via `anchored <tier> …`, see
`plugin/references/agent-contract.md`). The CLI never spawns.

## Pre-flight + plan

1. `anchored <tier> wrap <slug>` → `{ stage, tier, node, steps }` (tier derived; does NOT
   spawn). State gate: wrap expects a node whose build phases are terminal.
2. `steps` is the resolved wrap pipeline: for a task `[review, summarize]`, for an
   epic `[roll-up]`.

## Spawn each step's agent (Task tool, in order)

- **review → wrap-review** — final review pass over the built node; self-writes
  findings: `anchored <tier> log add <slug> wrap learning "<review findings>"`.
- **summarize → wrap-summarize** — writes a tight summary (what was built + the
  source='ai' decisions) into the node's own context:
  `anchored <tier> set <slug> context.wrap "<summary>"` (dotted-path → nested).
- **roll-up → epic-roll-up** (epic) — definition of done against `epic.acceptance`
  + a retro; self-writes via `epic log add`, then advances the epic.

## Custom run/use steps (the config's own steps — merge, tag, push …)

The wrap plan can carry custom steps beyond the workers — e.g. a task-tier `merge`
that lands the finished `task/<slug>` branch on `develop` (a branch-per-task
version-control strategy). A `kind: 'run'` step is **yours to execute via Bash**, in declaration
order, at its position in the plan. A `kind: 'use'` step spawns the named
subagent/skill.

**A `run:` step may carry `instructions:`** — prose you read and follow when you
execute the command (conditions, how to treat its output/errors, ordering hints
like "run this after the done-flip"). This is **uniform** with `use:` steps, which
also carry `instructions`. There is no special after-the-flip marker: a step that
must run *after* `done` simply says so in its `instructions`, and you honour that.

**Variable contract** — every `run` step gets these as real environment variables
(the config author writes `${TASK_SLUG}`; you export it, never string-substitute):

| Variable | Value |
|---|---|
| `TASK_SLUG` | the node being wrapped (the task-file / an epic child's slug) |
| `EPIC_SLUG` | the parent epic slug, or empty when not in an epic |

A failed run-step (e.g. a merge conflict) is a real failure: surface it, stay
pre-`done`, do **not** flip the status. Keep the git plumbing out of chat — report
the human outcome ("core-list ist auf develop gemerged."), not the commands.

## Concern-walk — the "check at the end" threads (harden-3)

During the build, workers + gates raise unexpected things that need a final look as
**concerns** on the node (`anchored <tier> concern add <slug> "<what>" <priority>`) —
a failing gate command, a deferred edge, a decision the build flagged. This is the v1
`task.context` "still to discuss" surface, made a real surface. **The substrate
blocks `done` while ANY concern is open (`ConcernsOpen`)** — nothing slips past.

So before you finish, run a **concern-walk** — the SAME shape as the refine Q&A walk:

1. List the open ones: read `anchored <tier> get <slug>` and filter `concerns[]` for
   the open ones in-session. If none, skip silently.
2. **Pick the threshold** (ephemeral, never persisted) via `AskUserQuestion`,
   exactly like refine: *"N open points — X important … Which do you want a say in?"*
   - **Just the important ones** (threshold `high`, default)
   - **Important + medium** (`medium`)
   - **All of them** (`low`)
   - **None — you decide** (`ai`)
   Each `AskUserQuestion` follows `question-style.md` (recommended option first,
   implications named).
3. **Resolve each open concern** by that threshold (at-or-above → user, below → you) —
   with reasoning:
   ```bash
   anchored <tier> concern resolve <slug> <id> "<how it's addressed>" user
   anchored <tier> concern resolve <slug> <id> "<decision>" ai "<why — read later>"
   ```
   "Addressed" = fixed, turned into a tracked follow-up, or explicitly accepted with
   a reason. A failed-gate concern means the work isn't actually green — that's a
   real blocker, resolve it honestly, don't rubber-stamp it.
4. Only once every concern is resolved does `done` go through (the substrate enforces it).

## Failure-handling

If an agent errors, surface it and stay pre-`done` (do not flip). The node only
becomes `done` once review + summary (or the roll-up) actually landed.

## Finish

Run the closing sequence: first the trailing custom run-steps (in declaration
order, **following each step's `instructions`** — a step whose `instructions` say
to run after the done-flip you defer accordingly), then flip `done` as the closing
action.

- **Trailing run-steps** (a `merge`/`push`) — run them in order, each per its own
  `instructions`. A failing **gating** run-step (e.g. a merge conflict) keeps the
  node pre-`done` (see Failure-handling); a step whose `instructions` place it
  *after* the flip runs once `done` has landed.
- **Flip:** `anchored <tier> status <slug> done` — the **same `wrap → done`
  transition on every tier** (D1: the epic mirrors the task lifecycle, no
  tier-special casing).
- **Archive (the closing move):** once `done`, the **last step is always**
  `anchored <tier> archive <slug>` — it moves the finished node into
  `.claude/anchored/_archive/` so the workspace shows only OPEN work (an epic moves its
  whole folder; a standalone task moves its file). **One exception:** a task that lives
  *inside an epic* (its slug carries a `/`, e.g. `my-epic/login`) is **not** archived
  on its own wrap — it stays in the epic folder and moves to `_archive/` together with
  the epic when the **epic** wraps. So: archive on wrap for an **epic** or a
  **standalone task**; skip the archive for an in-epic task.

Then tell the user: *"Wrap's done — summary's in context.wrap. Status: done, archived."* No
MCP, no raw node-file edit.
