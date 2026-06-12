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
| "Spawne wrap-review + summarize…" | "Letzter durchgang — ich review das ganze nochmal." |
| "set-field context.wrap geschrieben" | (nothing — the TL;DR IS the receipt) |
| "Status-flip wrap → done" | "Fertig. Alles grün — hier das TL;DR." |

**Vor jeder user-facing Zeile** das Jargon-Mapping aus `communication-style.md`
anwenden — Framework-Begriffe (scaffold, stub, seam, grounding, roll-up,
outcome-AC, executor, der each-Loop, drafted/refined, concern, DAG/JIT) gehören
nie in den Chat, nur ihr Klartext.

The skill is the **orchestrator**: it consults the `anchored` CLI for the
step-plan + node ops and spawns the wrap agents itself via the **Task tool**
(agents self-write via `anchored node …`, see
`plugin/references/agent-contract.md`). The CLI never spawns.

## Pre-flight + plan

1. `anchored wrap <slug>` → `{ stage, tier, node, steps }` (tier derived; does NOT
   spawn). State gate: wrap expects a node whose build phases are terminal.
2. `steps` is the resolved wrap pipeline: for a task `[review, summarize]`, for an
   epic `[roll-up]`.

## Spawn each step's agent (Task tool, in order)

- **review → wrap-review** — final review pass over the built node; self-writes
  findings: `anchored node append-log <slug> wrap learning "<review findings>"`.
- **summarize → wrap-summarize** — writes a tight TL;DR (what was built + the
  source='ai' decisions) into the node's own context:
  `anchored node set-field <slug> context.wrap "<TL;DR>"` (dotted-path → nested).
- **roll-up → epic-roll-up** (epic) — Definition-of-Done against `epic.acceptance`
  + a retro; self-writes via `append-log`, then advances the epic.

## Custom run/use steps (the config's own steps — merge, tag, push …)

The wrap plan can carry custom steps beyond the workers — e.g. a task-tier `merge`
that lands the finished `task/<slug>` branch on `develop` (a branch-per-task VCS
strategy). A `kind: 'run'` step is **yours to execute via Bash**, in declaration
order, at its position in the plan. A `kind: 'use'` step spawns the named
subagent/skill.

**Two kinds of trailing run-step — one runs before the `done` flip, one after.**
A run-step's `after_done` flag decides which side of the flip it lands on:

- **`after_done` absent (the default) — runs BEFORE the flip.** These are the steps
  that **gate completion**: a `merge`/`push` that can conflict or fail. Running them
  pre-`done` means a failure keeps the node pre-`done` (the merge only "counts" once
  the task actually finished).
- **`after_done: true` — runs AFTER the flip.** These are the steps that only
  **record the finished result**: the framework's `commit-audit-trail`, a provenance
  commit. They run *after* `done` so the committed task-file shows the terminal
  `status: done` and the working tree is left clean — not one flip stale. (See the
  Finish sequencing below.)

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
**concerns** on the node (`anchored node add-concern <slug> "<what>" <priority>`) —
a failed `--run` gate, a deferred edge, a decision the build flagged. This is the v1
`task.context` "still to discuss" surface, made a real surface. **The substrate
blocks `done` while ANY concern is open (`ConcernsOpen`)** — nothing slips past.

So before you finish, run a **concern-walk** — the SAME shape as the refine Q&A walk:

1. List the open ones: `anchored node concern-list <slug> open`. If none, skip
   silently.
2. **Pick the walk-style** (ephemeral, never persisted) via `AskUserQuestion`,
   exactly like refine: *"N offene Punkte — X wichtige … Wie gehen wir die durch?"*
   - **Nur die wichtigen gemeinsam — Rest entscheide ich** (high-together, default)
   - **Alle gemeinsam durchgehen** (all-together)
   - **Du entscheidest alles** (AI-all)
   Each `AskUserQuestion` follows `question-style.md` (recommended option first,
   implications named).
3. **Resolve each open concern** by that style — the user answers, or you decide
   with reasoning:
   ```bash
   anchored node resolve-concern <slug> <id> "<how it's addressed>" user
   anchored node resolve-concern <slug> <id> "<decision>" ai "<why — read later>"
   ```
   "Addressed" = fixed, turned into a tracked follow-up, or explicitly accepted with
   a reason. A failed-gate concern means the work isn't actually green — that's a
   real blocker, resolve it honestly, don't rubber-stamp it.
4. Only once every concern is resolved does `done` go through (the substrate enforces it).

## Failure-handling

If an agent errors, surface it and stay pre-`done` (do not flip). The node only
becomes `done` once review + summary (or the roll-up) actually landed.

## Finish

Run the closing sequence in this exact order — the `done` flip sits between the two
kinds of trailing run-step:

1. **Gating run-steps** (`after_done` absent — a `merge`/`push`) — run them now,
   pre-`done`. A failure here keeps the node pre-`done` (see Failure-handling).
2. **Flip:** `anchored node set-status <slug> done` — the **same `wrap → done`
   transition on every tier** (D1: the epic mirrors the task lifecycle, no
   tier-special casing).
3. **`after_done` run-steps** (the framework's `commit-audit-trail`, a provenance
   commit) — run them now, *after* the flip, so the committed task-file shows the
   terminal `status: done` and the tree is left clean.

Then tell the user: *"Wrap durch — TL;DR im context.wrap. Status: done."* No MCP, no
raw node-file edit.
