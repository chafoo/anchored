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
| "Spawning the plan-check gate agent…" | "Let me check the plan against the current state of the code." |
| "epic-refine runs epic-plan-check → epic-decompose → walk" | "I'll check the two tasks against the code and work out their acceptance criteria." |
| "refine intensity = intense" | "There's a lot moving here — let me look closely." |
| "status transition drafted → refined" | "Plan's been talked through. Run `/a:build`." |

**Before every user-facing line**, apply the jargon mapping from
`communication-style.md` — framework terms (scaffold, stub, seam, grounding,
roll-up, outcome acceptance criteria, execute, the each-loop, drafted/refined,
concern, dependency graph, just-in-time) never belong in chat, only their plain
words.

The skill is the **orchestrator**: it consults the `anchored` CLI for the
step-plan + node ops and spawns the refine agents itself via the **Task tool**
(agents self-write via `anchored <tier> …`, see
`plugin/references/agent-contract.md`). The CLI never spawns.

## Pre-flight + plan

1. `anchored <tier> refine <slug>` → `{ stage, tier, node, steps }` (tier derived from the
   node; does NOT spawn). State gate: refine expects `drafted`.
2. `steps` is the resolved refine pipeline: for a task
   `[plan-check, walk]` (plus any user-added gate steps from anchored.yml), for an **epic**
   `[epic-plan-check, epic-decompose, walk]` (D2 — epic-refine is a REAL stage:
   ground the stubs against code, then author per-stub outcome acceptance criteria, then walk).

## Set the refine intensity (main thread, cheap signals, no agent — B3)

Refine is **never fully skipped** — it caught real bugs in the dogfood. Instead it
runs at one of **three intensity levels**, and the **main thread sets the level
itself** from signals it already has — **no extra agent, no probe call**:

- **`low`** — a quick sanity glance. Still real: the gate agents read the plan, sniff
  for obvious drift, confirm the rules are covered. Never blind, just light.
- **`medium`** — the normal pass: check each phase against the code, walk the open
  questions, verify rule coverage.
- **`intense`** — the full drift + coverage check: every path, every default, every
  handler grounded against the real code; deep rule-by-phase coverage.

**Pick the level from cheap signals already in hand** (read once from
`anchored <tier> get <slug>`):

- **phase / stub count** — few phases (1–2) leans `low`; many (≥5) leans `intense`.
- **open-question count** — no open questions leans `low`; several high-priority ones
  lean `intense`.
- **greenfield vs. touches-existing-code** — a brand-new file with no neighbours leans
  `low`; work that edits or extends existing code (the drift risk lives there) leans
  `intense`.

Weigh them together, land on one level, and **pass it to every gate agent** in its
Task prompt (`refine intensity: <low|medium|intense>`). This replaces any old
binary-skip / "should we even refine" framing — the question is never *whether*, only
*how hard*.

**An agent MAY escalate its own level.** If a gate agent — running at `low` — smells
real drift (a path that moved, a default that fights the chosen architecture, a rule a
phase silently violates), it escalates itself to a deeper pass and notes why in its
rollup. The floor is set by the main thread; an agent can always go deeper, never
shallower.

## Spawn the gate agents — batch by `with:` (B4 + I)

The default template ships **one** refine gate per tier (task: `plan-check`). Users
may add further gate steps in their anchored.yml (e.g. a rules-coverage check via the
shipped `refine-rules-check` agent) — read the gates from the served `steps`, never
hardcode a pairing.

**Honor the template's `with:` marker.** The refine `steps` may mark sibling steps to
run in the same parallel batch (`{ name: <user-step>, with: plan-check }` — the I
positioner). When steps carry a `with:` relationship, spawn that whole batch in
**one** message (all `Task` calls together) and **join** before the next sequential
step. Independent gates ALWAYS batch — splitting focused checkers keeps each honest,
and running them together costs ~0 extra wall-clock. **Never merge batched steps into
one agent; never run a `with:` batch sequentially.**

**Task tier:**
- **plan-check → refine-plan-check** — validates the plan against current code
  (stale paths, unacknowledged handlers, hidden defaults), at the intensity passed in
  (a `low` glance vs. an `intense` full sweep); self-writes the rollup:
  `anchored task log add <slug> refine learning "<plan-check rollup>"`. Any
  drift it can't auto-fix becomes an open question.
- *(optional, user-wired)* **rules-check → refine-rules-check** — no longer a default
  step; a user can wire the shipped agent back in
  (`{ name: rules-check, use: { type: agent, name: refine-rules-check }, with: plan-check }`).
  When present it verifies each phase covers the applicable `.claude/rules/*.md` at the
  passed intensity; a missing rule-enforcement is an **auto-fix** (the agent adds an
  enforcing acceptance criterion itself), NOT a user question. Only a genuine
  architecture/code ambiguity becomes an open question.

**Epic tier (D2):**
- **epic-plan-check → epic-plan-check** — grounds the epic's task-stubs + their
  dependency order against the real code (seams exist, no drift, the order is
  sound), at the passed intensity; writes the grounding rollup to `context.refine`;
  genuine scope/architecture ambiguities → open questions.
- **epic-decompose → epic-decompose** — authors **outcome-level task acceptance
  criteria per stub** (`anchored epic child ac add <epic> <stub> "<outcome acceptance criterion>"`,
  the Epic→Task contract). These seed the just-in-time `plan task`'s phase
  decomposition at build (so the contract is never lost — the G8 fix) and are what
  the wrap roll-up validates the built task against.

  (epic-plan-check and epic-decompose run in declaration order; the `with:` marker, if
  the template sets it on epic steps, batches them the same way as the task gates.)

## The walk — resolve the node's known questions (SELECTION-based)

**walk** — the consolidated Q&A walk over the node's **own open questions** (the
concrete ambiguities the authoring agents surfaced). These are **real forks → they
stay selection-based** (`AskUserQuestion` + recommendation). This is distinct from the
escalation policy below (the one typed-prose question).

Read the open questions (`anchored <tier> get <slug>` and filter `questions[]` for
open). **If there are 0 open questions, skip the walk silently** (no
`AskUserQuestion`). Otherwise present each open question via `AskUserQuestion`:

  **Every question you put to the user follows `plugin/references/question-style.md`:**
  the question text already carries a worked-out **recommendation** + 1–3
  **implication** bullets (the authoring agent baked them in). In the
  `AskUserQuestion`, present the **recommended answer as the FIRST option** labelled
  `(Recommended)`, put the implication bullets in the question text above the options,
  and let each option note what it settles. If a question arrives WITHOUT that shape
  (terse/older), **work the recommendation + implications out yourself at ask-time**
  from the code/context before presenting — never ask the bare question.

  Record each answer: `anchored <tier> question resolve <slug> <id> "<answer>" user`.
  Where the user explicitly hands one back to you ("you decide"), resolve it
  `ai` WITH reasoning — the `reasoning` you record names the implications the choice
  settled (`question resolve <slug> <id> "<answer>" ai "<why>"`; reasoning is required
  for `source=ai`).

> **SELECTION vs PROSE split:** the node's actual **plan questions** (concrete
> ambiguities) stay **selection-based** (`AskUserQuestion` + recommendation — real
> forks deserve clickable choices). The **escalation policy** ("when else should I
> reach you during the build") is inherently open → **typed prose** (next section).
> Two kinds of input, two UIs.

## The build-escalation policy — ONE typed-prose question (Part II)

This **revises** the old selectable priority-threshold / `high·medium·low·ai` walk:
that multi-option threshold-and-timing picker for *when to interrupt during the build*
is gone, replaced by the single typed-prose question below. (The node's own plan
questions above keep their selection UI — only the escalation policy is prose.)

**Ask it ONCE, at the tier being refined**, after the node's own questions are walked:

- An **epic** asks it **once** and the answer **governs the entire epic build**,
  including every child task — it is **not** re-asked when the build just-in-time
  refines each child.
- A **standalone task** asks it **there**.

**How to ask — typed prose, NOT a menu.** Free-form text the user types, one question,
with a **suggested default baked into the prompt** (the lazy path = accept the
suggestion). Phrase it for a human (per `question-style.md` — plain language, no enum
tokens):

> "When do you want me to pull you in during the build?
> Default: just the important calls. Or: all of them · none, you decide · or name the
> topics you care about — e.g. 'anything touching persistence or auth, handle the
> rest yourself.'"

Capture the user's words (or the accepted default) and **hold them in working memory
for the whole run** — ephemeral, revisable mid-flight, **never written to a field**.
The build skill judges each build-time escalation moment against these words (the
`conditions` topic-filter mechanism, generalised to the run). The old priority presets
(`high`/`medium`/`low`/`ai`) survive only as **example phrasings** the user might
type, never as selectable options.

**The safety reflex (one line, skill-prose — no code).** Regardless of the user's
stated policy, **surface anything irreversible / high-blast-radius** — destroying
data, rewriting history, breaking a published contract or schema, and the like —
**even if the user named no condition that covers it.** This rides your normal review;
it is best-effort help, not a hard guarantee, and there is **no coded reversibility
engine** to maintain. It sits alongside the build's existing `stop`-conditions.

**Fallback — if refine was skipped** (`drafted → build` directly, no `/a:refine`),
this escalation question has not been asked. The **build skill asks it in the
pre-build walk** at the start of `/a:build` instead. So: refine asks it when refine
runs; build asks it when refine was skipped — exactly once either way.

### Epic walk — keep the surfaces separate (epics only)

When you refine an **epic** there are two distinct question surfaces:

**1 · The epic's OWN questions** — walk them **now**, selection-based
(`AskUserQuestion`), exactly as in "The walk" above, for the epic node's `questions[]`.

**2 · The child-task questions** — these arise *later*, in each child-task's own refine
during the build loop. They are **not** walked now and need **no** epic-wide policy
question of their own — the build loop's just-in-time `plan`/`refine` for each child
surfaces and walks that child's questions when the task is reached. The **single
build-escalation policy** (the typed-prose question above, asked once at the epic)
already governs *when you pull the user in during the whole build* — including those
child moments. There is no separate threshold/timing picker.

## Custom run/use steps (the config's own steps)

`anchored <tier> refine <slug>` returns the FULL plan — a user can add their own
refine steps beyond the gates. Dispatch them in declaration order at their plan
position (steps marked `with:` each other join the same parallel batch — see B4 + I
above): **`kind: 'run'`** → execute via Bash with the variable contract as real
env vars (`TASK_SLUG` = the node, `EPIC_SLUG` = parent epic or empty,
`NODE_SLUG` = the node currently being refined); a non-zero
run-step is a real failure → surface it, stay `drafted`. **`kind: 'use'`** → spawn
the named subagent / skill with its `instructions`; a worker writes results to a
declared custom field via `anchored <tier> set <slug> <field> "<value>"`. Keep
the plumbing out of chat — narrate the outcome, not the command.

## Failure-handling

If a gate agent errors, surface it and stay at `drafted` (do not flip). If the
user aborts the walk, already-resolved questions persist; re-running `/a:refine`
walks only the still-open ones.

## Decide the per-phase execute mode + phase dependencies (fan-out — task tier only, G12)

The fan-out mechanism already exists (the build SKILL runs `execute: workflow`
phases as a parallel per-criterion Dynamic Workflow). What was missing is the **decision** —
so by default every phase ran sequentially (a ~44-min epic for ~200 lines). Refine
is where that call belongs, because the phases + their acceptance criteria are now settled.
Two levers live here, both recorded ON THE PHASE (never global config):

- **Phase intra-fan-out** — a phase's `execute` mode: do this phase's
  acceptance criteria fan out in parallel (`workflow`) or land sequentially (`sequential`)?
- **Multi-phase parallelism** — a phase's `depends_on` (`phase set <slug> depends_on`): which sibling
  phases must finish before this one? Independent phases build in parallel via
  `task phase ready`; the dependency chain sequences. Set the edges where one phase truly
  needs another's output; leave independent phases free of each other.

**Default to the fastest safe path.** For each phase (`anchored task phase list
<slug>`), the call is about **correctness, never quality** — parallel and sequential
build the exact same thing:

- **Safety-floor (hard, non-negotiable — this is correctness, NOT
  speed-vs-quality).** Fan-out is safe only when the phase's acceptance criteria are
  genuinely **independent**: no criterion depends on another's output, and no two
  criteria mutate the same region of the same file. Non-independent criteria would
  race → corruption. That's the only thing the floor protects.
- **Within "safe" → default to `workflow`** (the fastest path), not sequential. A
  phase with **≥2 independent acceptance criteria fans out by default**.
- **`sequential`** only when the floor doesn't hold — a single
  criterion, or criteria that share sequential state / build on each other / touch
  the same region — **or** when you're genuinely unsure two criteria are independent
  (when the doubt is about *correctness*, stay sequential; leave it unset, absent ⇒ sequential).
- **Phase dependencies** follow the same independence test, one tier up: record
  `anchored phase set <slug>/<phase> depends_on "<comma-separated phase slugs>"` only
  where a phase genuinely consumes another's output. Phases left without a dependency
  edge are treated as independent and build in parallel.

**Ask the user once — speed vs. watchability (never a quality call).** The ONLY real
difference between parallel and sequential is that sequential lands the phases one
after another (the user can half-watch) while parallel lands them together — the
quality is identical. So offer it once, ephemeral (like the intensity), phrased per
`question-style.md`:
> "Where it's safe — as fast as possible (parallel) or one after another so you can
> follow along? Purely speed vs. watching — the quality is identical." Default: as
> fast as is safe.

Hold the answer in memory for this refine. If they pick "sequential to watch", leave
`execute` unset regardless of the floor and don't add parallelizing phase edges. The
user can always override a single phase's `depends_on` (`phase set <slug>/<phase> depends_on`) before build.
Epics have no phases — task-level fan-out across independent child-tasks is a
separate lever (the epic build loop), not this decision.

## Finish

**Receipt every executed refine step first** (step enforcement — the flip to `refined`
is BLOCKED by the CLI until every served refine step carries a receipt, the walk
included):
```bash
anchored <tier> step done <slug> refine <step> "<one-line rollup>"    # per completed step (plan-check, walk, custom gates)
anchored <tier> step skip <slug> refine <step> "<why it did not run>" # e.g. walk with 0 open questions
```
Write each `step done` right when the step completes (a gate agent's join, the walk's
end); then write the refine-trail (the gate rollups) to context.refine, and — only
when **every** question is resolved — flip the status:
```bash
anchored <tier> set <slug> context.refine "<gate rollups>"
anchored <tier> status <slug> refined
```
Tell the user: *"Plan's been talked through — N+M auto-fixes, K questions settled. Run `/a:build`."*
No MCP, no raw node-file edit.
