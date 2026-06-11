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
| "epic-refine fährt epic-plan-check → epic-decompose → walk" | "Ich prüf die zwei Tasks gegen den Code und arbeite ihre Akzeptanz-Kriterien aus." |
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
   `[plan-check, rules-check, walk]`, for an **epic**
   `[epic-plan-check, epic-decompose, walk]` (D2 — epic-refine is a REAL stage:
   ground the stubs against code, then author per-stub outcome-ACs, then walk).

## Spawn each step's agent (Task tool, in order)

**Task tier:**
- **plan-check → refine-plan-check** — validates the plan against current code
  (stale paths, unacknowledged handlers, hidden defaults); self-writes the rollup:
  `anchored node append-log <slug> refine learning "<plan-check rollup>"`. Any
  drift it can't auto-fix becomes an open question.
- **rules-check → refine-rules-check** — verifies each phase covers the applicable
  `.claude/rules/*.md`; self-writes the coverage rollup via `append-log`. A missing
  rule-enforcement is an **auto-fix** (the agent adds an enforcing AC itself), NOT a
  user question — project rules are framework requirements that get enforced, not
  negotiated. Only a genuine architecture/code ambiguity becomes an open question.

**Epic tier (D2):**
- **epic-plan-check → epic-plan-check** — grounds the epic's task-stubs + DAG
  against the real code (seams exist, no drift, DAG sound); writes the grounding
  rollup to `context.refine`; genuine scope/architecture ambiguities → open
  questions.
- **epic-decompose → epic-decompose** — authors **outcome-level task-ACs per stub**
  (`anchored node add-ac <epic> <stub> "<outcome AC>"`, the Epic→Task contract).
  These seed the JIT `plan task`'s phase decomposition at build (so the contract is
  never lost — the G8 fix) and are what the wrap roll-up validates the built task
  against.
- **walk** — the consolidated Q&A walk. **First, pick the walk-style** (this is the
  v1 Stage-0 choice, ephemeral — never persisted): read the open questions
  (`anchored node question-list <slug> open`), count them by priority, and ask
  the user via `AskUserQuestion`:

  Phrase it for a human — **plain priority words, no raw enum tokens, and the
  walk-style codes stay INTERNAL** (they're only the value you pass to
  `resolve-question`, never a user-visible label):

  > "N Fragen — X wichtige, Y mittlere, Z geringe. Wie wollen wir die durchgehen?"
  > - **Nur die wichtigen — den Rest entscheide ich** (internal: `high-together`,
  >   the recommended default / sweet spot)
  > - **Alle gemeinsam durchgehen** (internal: `all-together`)
  > - **Du entscheidest alles** (internal: `AI-all`)

  **If there are 0 open questions, skip this silently** (no AskUserQuestion). Then
  walk each question in priority order per the chosen style: a question AT-or-above
  the threshold goes to the user (`resolve … user "<answer>"`); the rest the AI
  decides WITH reasoning (`resolve … ai "<answer>" "<why>"` — reasoning is
  required for `source=ai`).
  `anchored node resolve-question <slug> <id> "<answer>" <user|ai> ["<reasoning>"]`

### Epic-wide question policy (H3 — epics only)

When you refine an **epic**, the choice above ALSO decides how the questions that
arise *later* — in each child-task's own refine during the build loop — get handled.
For an epic, offer a **fourth, richer option** and remember the choice for the build:

> "Wie wollen wir's mit den Fragen halten — auch bei den einzelnen Tasks später?"
> - **Nur die wichtigen — den Rest entscheide ich** (the recommended default;
>   internal: `high-together`)
> - **Alle gemeinsam durchgehen** (internal: `all-together`)
> - **Du entscheidest alles** (internal: `AI-all`)
> - **Sag mir, worauf du Einfluss willst** — frei beschrieben, z.B. "frag mich bei
>   allem zu Persistenz oder der UI-Sprache, den Rest entscheidest du"
>   (internal: `conditions`, plus the user's own words)

This follows `plugin/references/question-style.md` (recommended option first,
implications named). Hold the chosen policy **in your working memory for this epic
run** — ephemeral, never written to a field. Within the same session it carries from
refine into the `/a:build` loop, where it governs every child-task's refine. The
free-form option is epic-only (a single task's refine just uses the three fixed
styles; its build-time decisions are already covered by the stop-conditions).

  **Every question you put to the user follows `plugin/references/question-style.md`:**
  the question text already carries a worked-out **recommendation** + 1–3
  **implication** bullets (the authoring agent baked them in). In the
  `AskUserQuestion`, present the **recommended answer as the FIRST option** labelled
  `(Empfohlen)`, put the implication bullets in the question text above the options,
  and let each option note what it settles. If a question arrives WITHOUT that shape
  (terse/older), **work the recommendation + implications out yourself at ask-time**
  from the code/context before presenting — never ask the bare question. For an
  **AI-resolved** question, the `reasoning` you record names the implications the
  choice settled.

## Failure-handling

If a gate agent errors, surface it and stay at `drafted` (do not flip). If the
user aborts the walk, already-resolved questions persist; re-running `/a:refine`
walks only the still-open ones.

## Decide the per-phase executor (fan-out — task tier only, G12)

The fan-out mechanism already exists (the build SKILL runs `executor: workflow`
phases as a parallel per-AC Dynamic Workflow). What was missing is the **decision** —
so by default every phase ran sequentially (a ~44-min epic for ~200 lines). Refine
is where that call belongs, because the phases + their ACs are now settled.

For each phase (`anchored node list-phases <slug>`), judge **fan-out suitability**:

- **`workflow`** (fan-out) when the phase has **≥2 acceptance criteria that are
  independent** — each can be implemented + verified on its own, with no AC
  depending on another's output and no two ACs mutating the same region of the
  same file. Then: `anchored node set-executor <slug> <phase> workflow`.
- **`implement`** (sequential, the default) otherwise — a single AC, or ACs that
  share sequential state / build on each other / touch the same code region.
  Leave it unset (absent ⇒ implement); do **not** force fan-out where the ACs
  would race on the same lines.

This is an **AI judgement** (the orchestrator decides, like the walk-style) — be
conservative: when unsure whether two ACs are truly independent, leave it
sequential. The user can override either way with `set-executor` before build.
Epics have no phases — task-level fan-out across independent child-tasks is a
separate lever (the epic build loop), not this decision.

## Finish

Write the refine-trail (the plan-check + rules-check rollups) to context.refine,
then — only when **every** question is resolved — flip the status:
```bash
anchored node set-field <slug> context.refine "<plan-check + rules-check rollups>"
anchored node set-status <slug> refined
```
Tell the user: *"Plan refined — N+M auto-fixes, K Fragen geklärt. Run `/a:build`."*
No MCP, no raw node-file edit.
