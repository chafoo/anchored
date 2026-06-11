---
name: refine
description: Validate a drafted plan against current code + rules and walk the open questions before build, orchestrating the refine agents in-session. Triggers ONLY on the explicit `/a:refine <slug>` command. Use for `/a:refine`, not for general code review.
---

# /a:refine — fractal refine stage (skill-orchestrated)

Explicit-only: the user typed `/a:refine <slug>`.

## Communication style

Partner voice in chat, machinery only in the audit trail — see
`plugin/references/communication-style.md`:

| Avoid (machinery) | Prefer (partner) |
|---|---|
| "Spawne plan-check + rules-check parallel…" | "Lass mich den plan kurz gegen den aktuellen code-stand prüfen." |
| "Walk-Style = high-together" | "Okay — die wichtigen kläre ich mit dir, den rest mach ich selbst." |
| "Status-Transition drafted → refined" | "Plan ist refined. Run `/a:build`." |

The skill is the **orchestrator**: it consults the `anchored` CLI for the
step-plan + node ops and spawns the refine agents itself via the **Task tool**
(agents self-write via `anchored node …`, see
`plugin/references/agent-contract.md`). The CLI never spawns.

## Pre-flight + plan

1. `anchored refine <slug>` → `{ stage, tier, node, steps }` (tier derived from the
   node; does NOT spawn). State gate: refine expects `drafted`.
2. `steps` is the resolved refine pipeline: for a task
   `[plan-check, rules-check, walk]`, for an epic `[walk]`.

## Spawn each step's agent (Task tool, in order)

- **plan-check → refine-plan-check** — validates the plan against current code
  (stale paths, unacknowledged handlers, hidden defaults); self-writes the rollup:
  `anchored node append-log <slug> refine learning "<plan-check rollup>"`. Any
  drift it can't auto-fix becomes an open question.
- **rules-check → refine-rules-check** — verifies each phase covers the applicable
  `.claude/rules/*.md`; self-writes the coverage rollup via `append-log`. A missing
  rule-enforcement is an **auto-fix** (the agent adds an enforcing AC itself), NOT a
  user question — project rules are framework requirements that get enforced, not
  negotiated. Only a genuine architecture/code ambiguity becomes an open question.
- **walk** — the consolidated Q&A walk. **First, pick the walk-style** (this is the
  v1 Stage-0 choice, ephemeral — never persisted): read the open questions
  (`anchored node question-list <slug> open`), count them by priority, and ask
  the user via `AskUserQuestion`:

  > "N Fragen — X high, Y medium, Z low. Wie durchgehen?"
  > - **Nur die wichtigen (high) — Rest entscheide ich** (`high-together`, the
  >   recommended default / sweet spot)
  > - **Alle gemeinsam** (`all-together`)
  > - **Du entscheidest alles** (`AI-all`)

  **If there are 0 open questions, skip this silently** (no AskUserQuestion). Then
  walk each question in priority order per the chosen style: a question AT-or-above
  the threshold goes to the user (`resolve … user "<answer>"`); the rest the AI
  decides WITH reasoning (`resolve … ai "<answer>" "<why>"` — reasoning is
  required for `source=ai`).
  `anchored node resolve-question <slug> <id> "<answer>" <user|ai> ["<reasoning>"]`

## Failure-handling

If a gate agent errors, surface it and stay at `drafted` (do not flip). If the
user aborts the walk, already-resolved questions persist; re-running `/a:refine`
walks only the still-open ones.

## Finish

Write the refine-trail (the plan-check + rules-check rollups) to context.refine,
then — only when **every** question is resolved — flip the status:
```bash
anchored node set-field <slug> context.refine "<plan-check + rules-check rollups>"
anchored node set-status <slug> refined
```
Tell the user: *"Plan refined — N+M auto-fixes, K Fragen geklärt. Run `/a:build`."*
No MCP, no raw node-file edit.
