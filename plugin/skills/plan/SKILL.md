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
| "anchored plan epic … → node erstellt (status plan)" | "Lege das epic für `<slug>` an." |
| "Spawne discover + decompose…" | "Lass uns das durchsprechen — was genau soll rein?" |
| "Status-flip plan → drafted" | "Plan steht — N phasen, M ACs, K offene fragen. Run `/a:refine`." |

The skill is the **orchestrator**: it consults the `anchored` CLI for the
step-plan + node ops and spawns each plan agent itself via the **Task tool**. The
agents self-write phases/ACs via `anchored node …` (see
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
anchored plan <tier> "<description>"   # → { tier, node, steps }   (creates the node, does NOT spawn)
```

(A missing `anchored.yml` is fine — the CLI lazy-inits a minimal one + the
`Bash(anchored *)` allowlist on first use.) `steps` is the resolved plan-stage
pipeline: for a task `[discover, rules-scan, decompose]`, for an epic
`[discover, scaffold]`.

## Spawn each step's agent (Task tool, in order)

For each worker step in `steps`, spawn its `agent` via the Task tool with the
agent-contract input `{ task-slug: <node.slug>, tier, stage: plan, context, rules,
instructions }`:

- **discover → plan-discover** — scans the codebase; self-writes findings:
  `anchored node append-log <slug> plan learning "<affected paths / patterns>"`.
- **rules-scan → plan-rules-scan** — collects applicable `.claude/rules/`:
  `anchored node append-log <slug> plan learning "<relevant rules>"`.
- **decompose → plan-decompose** (task) — writes phases + testable ACs:
  `anchored node add-phase <slug> <phase-slug> "<name>"` then
  `anchored node add-ac <slug> <phase-slug> "<testable AC>"` (id auto-assigned).
- **scaffold → epic-scaffold** (epic) — coarse task stubs:
  `anchored node add-child <slug> <task-stub-slug>` (DAG via depends_on).

Surface generously: any ambiguity the decompose agent hits becomes an open
question (`anchored node add-question <slug> "<q>" high`), NOT a silent decision —
`/a:refine` walks them.

## Failure-handling

If an agent returns nothing or errors, do NOT flip to drafted — surface what
failed and let the user re-run; a half-decomposed plan is worse than a clear
failure. Only flip when the structure is actually written.

## Finish

Write the plan-trail prose (intro + the discover/decompose summary) to the node's
own context, then flip the status:
```bash
anchored node set-field <slug> context.plan "<intro + the plan-trail summary>"
anchored node set-status <slug> drafted
```
(`set-field` supports the dotted path — `context.plan` is set nested.) Tell the
user: *"Plan steht — N Phasen, M ACs, K offene Fragen. Run `/a:refine` als
nächstes."* No MCP, no raw node-file edit.
