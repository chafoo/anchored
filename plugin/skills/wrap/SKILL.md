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

## Failure-handling

If an agent errors, surface it and stay pre-`done` (do not flip). The node only
becomes `done` once review + summary (or the roll-up) actually landed.

## Finish

`anchored node set-status <slug> done` — the **same `wrap → done` transition on
every tier** (D1: the epic mirrors the task lifecycle, so there is no tier-special
casing here anymore). Tell the user: *"Wrap durch — TL;DR im context.wrap. Status:
done."* No MCP, no raw node-file edit.
