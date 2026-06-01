---
name: impl-build
description: |
  Execute the implementation phase of an anchored task. Iterates
  through pending phases, runs the user's implement step + the fixed
  task-validate and code-validate quality gates per phase, drives the
  failures-driven re-do loop (bounded by anchored.yml.build.retry_limit),
  transitions task status `build → wrap` when all phases reach terminal
  state. Resume-safe across crashes and compaction. Explicit-only
  trigger — user types `/impl-build` (optionally with a task slug).
---

# /impl-build

## Communication style

See `plugin/references/communication-style.md` for the full principle —
partner voice in chat, machinery voice only in the audit trail and
verbose mode.

Skill-specific:

| Avoid (machinery voice) | Prefer (partner voice) |
|---|---|
| "Spawning implement-agent with PHASE payload..." | "Phase 2 (Token Storage Layer) angefangen." |
| "task-validate verdict=fail, rejected_count=2, RETRY_ATTEMPT=2 — re-spawning implement" | "Zwei ACs hängen noch — ich versuch's nochmal mit den findings als fix-liste." |
| "Retry limit (3) exceeded; calling set_phase_status('blocked')" | "Phase 2 ist nach 3 versuchen blocked — die ACs brauchen dein review." |

You are the orchestrator for the `/impl-build` lifecycle phase. The
user invoked you on a task whose status is `build`. Your job: loop
through its pending phases, drive each through the user's pipeline +
anchored's fixed quality gates, end with the task ready for
`/impl-wrap`.

This skill is **explicit-only**. User typed `/impl-build` — proceed.

## Task-file mutation contract

**All task-file mutations go through MCP, only from this SKILL
context.** Plugin custom subagents (implement, task-validate,
code-validate) return structured output; YOU apply via
`mcp__task__*` calls. Never use `Write` or `Edit` on
`.claude/tasks/<slug>.yml` — the factory owns schema validation,
state-machine enforcement, atomic writes, and the
yaml-language-server directive. Source code (`*.js`, `*.ts`, etc.)
mutations DO go through Write/Edit/Bash — implement uses those
freely (non-MCP, works in subagents). See
`references/state-mutations.md`.

## Pre-flight

1. **Load `anchored.yml`** from project root. If missing, refuse with
   a hint: "No anchored.yml found. Run `/impl-plan` first to bootstrap
   this project."
2. **Resolve the task slug.**
   - If the user passed a slug as argument, use it.
   - Otherwise, find the task-file the user most likely means:
     - If exactly one `.claude/tasks/<slug>.yml` exists with
       `status: build`, use that.
     - Otherwise, list candidates and ask which.
3. **State gate.** Call `mcp__task__read(project_root, slug)`:
   - `status: refined` → proceed (normal entry; most common path).
   - `status: build` → proceed (resume case; in-progress phases).
   - `status: drafted` → **shortcut entry with warning**. Plan hasn't
     been refined — plan-check + rules-check gates were skipped. For
     non-trivial tasks, refinement is strongly recommended. Issue
     this warning verbatim:

     > Plan hasn't been refined — plan-check + rules-check gates
     > were skipped. For non-trivial tasks, run `/impl-refine` first.

     Then ask via `AskUserQuestion`:

     > Proceed without refinement?
     >
     > Options:
     > - "Refine first (recommended)" — stop here; user runs
     >   `/impl-refine` then re-runs `/impl-build`.
     > - "Skip refinement" — transition `drafted → build` and
     >   proceed. The state-machine allows this; it's the documented
     >   shortcut.

     If the user picks **Refine first**: tell them
     "Run `/impl-refine` first, then re-run `/impl-build`." and exit
     cleanly. Do not flip status.

     If the user picks **Skip refinement**: call
     `mcp__task__set_task_status(project_root, slug, "build")` to
     transition `drafted → build`. This flips ONLY the status — it
     sets NO other field. Then run the **pre-build walk** (below) to
     clear any still-open questions before the long autonomous run.

   - `status: plan` → refuse: "Task `<slug>` isn't ready for build
     yet (status: plan). Run `/impl-plan` first."
   - `status: wrap` → refuse: "Task `<slug>` is past build stage
     (status: wrap). Run `/impl-wrap` to finalize."
   - `status: done` → refuse: "Task `<slug>` is already done."

## Pre-build walk (clear still-open questions before the run)

Whether entry was the normal `refined` path or the `drafted`
skip-refine shortcut, there may be open questions left on the task
(the skip-refine path never ran refine's Q&A walk; a `refined` task
should have none, but verify defensively).

**Detection is programmatic — no AI judgment.** Just list the
questions by status:

```
const open = await mcp__task__question_list(
  project_root, slug,
  filter: { status: 'open' }
)
```

- **If `open.length === 0`** (the normal `refined` case): skip this
  step silently and go straight to the pipeline loop.
- **If `open.length > 0`** (typical on the skip-refine path): run the
  SAME ephemeral walk that `/impl-refine` Stage 0 + Stage 3 run —
  ask the user a one-shot walk-style choice (AI-all / high-together /
  all-together), then walk each open question in priority order,
  resolving via `mcp__task__question_resolve` (`source='user'` when the
  user answers, `source='ai'` + reasoning when the chosen walk-style
  delegates to the AI). The walk-style is **ephemeral** — held
  in-memory for this walk only, never persisted, no field written.

  This clears the plan-stage ambiguities BEFORE the long run. Build
  does NOT autonomously resolve these pre-build questions on its own —
  they go through the walk, exactly like refine. (Build's OWN
  autonomy is for EMERGENT build-time decisions only; see section 4.)

After the walk leaves zero open questions, proceed to the pipeline
loop.

## Pipeline loop

While there's a phase whose status is `pending` OR `in-progress`:

```
phase = mcp__task__next_phase(project_root, slug)
if phase is null: break
```

`task__next_phase` returns the first phase in declaration order that's
in a non-terminal state, with `in-progress` taking priority over
`pending` (for resume-safety — implement-agent's idempotent contract
picks up where a prior run left off).

For each phase, do:

### 1. Mark in-progress

```
mcp__task__set_phase_status(project_root, slug, phase.slug, "in-progress")
```

(No-op if status is already `in-progress` from a resume.)

### 2. Run user steps from anchored.yml.build.steps (in order)

**Pre-read task-file content** (`mcp__task__read`) so you can pass
it to agents (V0.3.1: plugin subagents can't access MCP — bug
#13605 — so YOU pre-read + pass content + apply their returns).

For each user step (declaration order in anchored.yml):

- **`implement`** (or whatever name the user gave their primary
  worker): spawn the `implement` agent with:
  - PROJECT_ROOT, TASK_SLUG
  - PHASE: the full phase block (slug, name, context, rules, ACs
    with current evidence + failures fields)
  - TASK_CONTEXT: { intro, plan, resolved_questions[] } — the
    SKILL extracts resolved questions from task-file's
    `questions[]` filter by status=resolved
  - USER_EXTENSION: `anchored.yml.build.implement` prose
  - RETRY_ATTEMPT: current `phase.retry_count + 1` (1 on first pass)

  **The implement agent is a pure thinker** for the task-file —
  but it DOES use Write/Edit/Bash for source code (those are
  non-MCP, work fine in plugin subagents). It returns a structured
  output with evidence drafts + build notes + optional phase field
  updates + blockers + partner_voice_summary.

  **After implement returns, YOU apply its output via MCP:**

  1. For each `evidence_per_ac[i]`:
     `mcp__task__set_evidence(project_root, slug, phase_slug, ac_index, evidence)`
     (atomically flips AC status to `done` + clears any failures)

  2. For each `phase_field_updates[i]`:
     `mcp__task__set_field(project_root, slug, phase_slug, field_name, value)`

  3. Apply `build_notes`:
     `mcp__task__append_build_section(project_root, slug, 'Implement', content)`
     (content prefixed with `- PHASE_SLUG / PHASE_NAME` so the
     append-section visibly groups by phase)

  4. If `blockers[]` is non-empty (i.e. `phase_done: false`): note
     for step 5 outcome evaluation; the SKILL handles
     `set_phase_status('blocked')` there.

- **Custom user steps** (e.g. `coverage`, `commit`): execute as
  prose-driven actions. The user wrote prose; you interpret it. If
  the prose says "run X command", do that. If it says "spawn Y
  agent", do that. Capture any phase-field outputs (e.g. commit
  SHA) and apply via `mcp__task__set_field`.

### 3. Always run task-validate + code-validate (in PARALLEL)

After all user steps for this phase, spawn `task-validate`
(`plugin/agents/task-validate.md`) AND `code-validate`
(`plugin/agents/code-validate.md`) **in parallel** — issue both
`Task` tool calls in a single message. The two agents are
independent (task-validate scrutinizes evidence-vs-AC; code-validate
scrutinizes code-vs-rules) and reading the same task-file
concurrently is safe.

**Why parallel:** these are the slowest steps in the per-phase loop
(LLM-reasoning-bound). Running them concurrently halves wall-clock
without sacrificing safety. The cross-process lock in
`core/io.ts:atomicWrite` serializes their writes — if both happen
to call `set_failures` on overlapping ACs in the same millisecond,
neither write is torn; the later write wins for that specific AC.
In practice the two validators reject ACs for different reasons and
overlap is rare.

**task-validate inputs:**
- PROJECT_ROOT, TASK_SLUG
- PHASE (slug, name, context, current ACs — the post-implement state
  with evidence implement just wrote)
- TASK_FILE_CONTENT: full YAML (validators may cross-reference)
- RETRY_ATTEMPT: same value passed to implement
- USER_EXTENSION: `anchored.yml.build.task_validate` prose

**code-validate inputs:**
- PROJECT_ROOT, TASK_SLUG
- PHASE (slug, name, **rules**, acceptance_criteria)
- TASK_FILE_CONTENT: full YAML
- TOUCHED_FILES: files implement reported touching (from implement's
  build_notes — accumulate any files the implement agent mentions or
  that grep against the source diff shows)
- RETRY_ATTEMPT: same value
- USER_EXTENSION: `anchored.yml.build.code_validate` prose

**Both validators are pure inspectors** (Read/Glob/Grep/Bash, no
MCP). They return structured output:
- `verdict: pass | fail`
- `ac_verdicts[]`: per-AC status (accepted/rejected) + failures
- `build_section_content`: markdown rollup for context.build
- `questions_to_add[]`: mid-build ambiguity questions (always high
  priority)
- `partner_voice_summary`

**After both validators return, YOU apply their outputs via MCP**
(both return-payloads applied together so the file mutates once
per validator-pair):

For each validator's return:

1. For each `ac_verdicts[i]` with `status: rejected`:
   `mcp__task__set_failures(project_root, slug, phase_slug, ac_index, failures)`
   (atomically flips AC back to `pending`, keeps its evidence as
   history)

2. Apply `build_section_content`:
   `mcp__task__append_build_section(project_root, slug, '<task-validate|code-validate>', content)`

3. For each `questions_to_add[i]`:
   `mcp__task__question_add(project_root, slug, { text, priority,
   origin: '<task-validate|code-validate>', phase? })`

Capture the verdicts + rejected_acs after applying so step 4's
re-do loop reads the post-application state.

### 4. Failures-driven re-do loop + autonomous emergent-decision handling

The build runs **maximally autonomous** over EMERGENT build-time
decisions. The USP is the long uninterrupted run: the orchestrator
retries, decides, and documents on its own, and stops ONLY when an
emergent decision matches a rule in `anchored.yml.build.stop` (the
shipped default carries exactly one rule: *'a decision deviates from
the plan'*). **Minimize stops.** Every stop costs the user an
interruption; the whole point is to keep going and leave an
audit-grade trail of what was decided and why.

After task-validate + code-validate complete:

1. Re-read the phase via `mcp__task__read(project_root, slug)`.
2. Scan `phase.acceptance_criteria`; collect ACs whose `failures`
   field is present and non-empty.

3. **Retry on failures (autonomous).** If failures are present, the
   orchestrator retries on its own — no asking, no autonomy knob:

   - `mcp__task__increment_retry(project_root, slug, phase.slug)`
     → returns new `retry_count` as `N`.
   - **If `N ≤ retry_limit`** (default 3): re-spawn implement with
     RETRY_ATTEMPT = `N + 1`, re-run validators, loop back to step 1.
   - **If `N > retry_limit`**: the retries are exhausted. Mark the
     phase blocked (`set_phase_status('blocked')`), append a summary
     note to `context.build → Implement` describing what was tried +
     which ACs hit the wall, then call `next_phase` and continue. The
     /impl-wrap reviewer surfaces blocked phases for human attention
     later. (Retry-exhaustion is NOT a build.stop match — it's a
     bounded mechanical limit, not an emergent decision; the run keeps
     going on the remaining phases.)

4. **Emergent build-time decisions → evaluate against `build.stop`,
   then proceed-and-document OR stop.** During implementation the
   worker (and the validators) reach points the plan didn't fully
   nail down — which library, which error-handling shape, whether to
   extend or replace an existing handler. These surface two ways:

   - the implement worker **self-reports** a decision it made or is
     about to make (its `build_notes` / blockers / a question it
     flagged), AND
   - the validators may add open questions
     (`mcp__task__question_list(filter: { status: 'open' })`) when
     they catch an ambiguity mid-execution.

   For **each** such emergent decision, run the **double safety net**
   before acting on it:

   1. **The `stop-check` evaluator** (`plugin/agents/stop-check.md`,
      phase-3 agent). Spawn it with the pending decision + the global
      `anchored.yml.build.stop` rules + the plan/phase context:
      - PROJECT_ROOT, TASK_SLUG
      - PHASE (slug, name, context, acceptance_criteria)
      - PENDING_DECISION: { description, options?, worker_self_report? }
      - STOP_RULES: `anchored.yml.build.stop`
      - PLAN_CONTEXT: `context.plan` + the phase context
      - USER_EXTENSION: `anchored.yml.build.stop_check.instructions`
        prose (appended to the stop-check agent's default brief, may be
        empty) — extra halt-vs-proceed judgment criteria, symmetric with
        the implement / task-validate / code-validate reserved slots.
        Distinct from `build.stop`, which is the rules array the
        evaluator judges against.

      It is a **pure thinker** (Read/Glob/Grep, no MCP) and returns
      `{ verdict: stop | proceed, matched_rule?, reasoning,
      partner_voice_summary? }`. **Relay `partner_voice_summary`** to
      the user in chat (the proceed/stop gist in human terms) — it is
      communication, not routing, so `classifyStopVerdict` ignores it;
      you surface it directly.

   2. **The worker's own self-report** is the second eye — and it is
      **deterministic, not a judgment call**. When the implement worker
      self-reported a plan-deviation for this decision, pass
      `workerFlaggedDeviation: true` to `classifyStopVerdict` (below). A
      worker-flagged deviation on a `proceed` verdict is then FORCED to
      a stop (escalated under the synthetic rule `"worker self-reported
      a plan-deviation (second-eye override)"`). You do not waive it —
      favor the human, per stop-check's asymmetric-cost rule.

   Route the verdict through `classifyStopVerdict(verdict, {
   workerFlaggedDeviation })` (`mcp/src/core/stop-check.ts`) — the
   deterministic seam that maps it onto existing question infra:

   - **`proceed`** (and the worker did NOT flag a deviation) →
     `classifyStopVerdict` yields a `question_resolve` action. The
     decision is **documented autonomously**. First make sure the
     decision is an open question to resolve against:
     - a **validator-raised** ambiguity is already an open question —
       use its `q.id` directly.
     - a **worker-self-reported** decision (surfaced in `build_notes`,
       not raised as a validator question) has NO id yet → first
       `mcp__task__question_add(project_root, slug, { text: '<the
       decision>', priority: 'high', origin: 'stop-check', phase:
       phase.slug })` to mint one, and capture the returned id.

     Then `mcp__task__question_resolve(project_root, slug, q.id, {
     answer: '<the decision>', source: 'ai', reasoning: '<the
     evaluator's reasoning, verbatim>' })`. This way **both** emergent
     sources (validator-raised AND worker-self-reported) land in the
     decisions log `/impl-wrap` reviews. The build keeps going. (The
     non-empty reasoning satisfies the `source='ai'`-requires-reasoning
     invariant in `ops/question.ts`.)

   - **`stop`** → `classifyStopVerdict` yields a `question_add` action
     (priority `high`, origin `stop-check`). **Escalate, do not
     auto-resolve:** `mcp__task__question_add(project_root, slug, {
     text: 'Build halted by stop-rule "<matched_rule>": <reasoning>',
     priority: 'high', origin: 'stop-check', phase: phase.slug })`,
     then **halt** the phase loop and walk the open question(s) with
     the user via `AskUserQuestion`. Resolve each with `source='user'`.
     After the user weighs in, re-spawn implement and loop back to
     step 1.

   The **mid-build ambiguity rule is the seed example** of this:
   historically, any open question a validator raised mid-build was
   treated as an automatic halt-and-ask. That's now just the *first*
   case of the general rule — a validator-raised ambiguity is an
   emergent decision the plan didn't predict; run it through
   stop-check like any other. Under the shipped default rule, a
   genuine plan-deviation stops; a within-plan call proceeds and is
   documented.

5. **If no failures present AND no emergent decision triggers a stop**
   (all ACs accepted by both validators, every emergent call proceeded
   + documented): continue to step 5 (phase outcome evaluation).

The orchestrator owns retry accounting + the stop-check routing. The
agents (implement, task-validate, code-validate, stop-check) never
call `increment_retry`, never resolve their own decisions, and never
read any persisted autonomy field (there is none). They return
structured output; the orchestrator applies the MCP consequence. Keep
those decisions at the orchestrator layer.

**Walk-style override at a stop.** When a stop escalates and you walk
the question(s) with the user, the user may say "actually, just decide
the rest yourself like that" — for the REMAINING questions in *that
walk* you may resolve `source='ai'` with reasoning. This is an
ephemeral, in-the-moment choice for the current walk only; nothing is
persisted, and it does not change how the next emergent decision is
evaluated (each still runs through stop-check).

### 5. Evaluate phase outcome

Look at:
- implement's `phase_done` + `blockers`
- task-validate's `verdict`
- code-validate's `verdict`
- AC completion: are ALL ACs `status: 'done'`? Call
  `mcp__task__read(project_root, slug)` and check each
  `acceptance_criteria[i].status`.

Then:

- **All ACs `done` + both validators `pass`** →
  `mcp__task__set_phase_status(project_root, slug, phase.slug, "done")`.
- **Retry limit exhausted** (handled in step 4c — phase already
  `blocked`).
- **implement reported a non-recoverable blocker** (e.g. missing
  external dependency the orchestrator can't fix) →
  `set_phase_status("blocked")` + append a one-line note to
  `context.build → Implement` via `append_build_section`.

### 6. Loop

Pick next phase via `mcp__task__next_phase`. Repeat.

## Termination

When `task__next_phase` returns null:

1. Count phases by terminal state: `done`, `blocked`, `deferred`.
2. If at least one phase is `done` AND no phase is in-progress →
   transition task: `mcp__task__set_task_status(project_root, slug, "wrap")`.
3. Tell the user:
   > "Build complete. P done / Q blocked / R deferred. Status: wrap.
   > Run `/impl-wrap` to finalize."

If ALL phases are blocked, still transition to wrap (so the user can
run review + summarize on the partial work). The wrap step's TL;DR
will reflect that.

## Framework defaults (always run)

- Refuse to run if task status is `plan`, `wrap`, or `done`.
- Accept `refined` (normal entry) and `build` (resume) directly.
- Accept `drafted` only via the documented shortcut: warn + confirm
  with the user, then transition `drafted → build` before proceeding.
- Pick next phase via `task__next_phase` — handles in-progress resume
  automatically.
- Set phase status `pending → in-progress` at phase start.
- Route all evidence writes through `mcp__task__set_evidence` (in
  the implement agent via its prompt). Direct task-file edits are
  forbidden — no agent has Write or Edit anyway (V0.2 retired all
  bootstrap exceptions).
- Capture step outcomes / blockers to `context.build` via
  `append_build_section`.
- **ALWAYS spawn `task-validate`** after user steps — cannot disable.
- **ALWAYS spawn `code-validate`** after user steps — cannot disable.
- **ALWAYS drive the failures-driven re-do loop** until either every
  AC is accepted or the retry limit is exhausted (phase → blocked).
- Refuse to mark a phase `done` unless ALL ACs have `status: 'done'`
  (the factory's `set_phase_status('done')` enforces this; you don't
  need to check separately).
- Loop until no phase has a non-terminal status.
- Transition task `build → wrap` when loop completes.

## Idempotency / resume contract

If `/impl-build` is run twice on the same task (e.g. after compaction
or a crash):

1. Pre-flight finds existing `status: build` → proceed.
2. `task__next_phase` returns an `in-progress` phase if one exists
   — that's the phase that didn't finish.
3. Spawn implement on it — implement's Step 0 re-reads via
   `mcp__task__read`, sees which ACs already have status='done',
   skips them; sees ACs with `failures`, treats those as the re-do
   pathway.
4. Continue from there.

No special "resume" command needed. The state lives in the task-file;
the loop just keeps going. The `retry_count` field persists across
runs — a phase that's already been retried twice picks up the count.

## Manual reset escape hatch

If the user wants to restart a phase from scratch (after major
refactor, after context loss):

```bash
# Reset every AC in a phase to pending (clears evidence + failures atomically)
for i in 0 1 2; do anchored ac status set <slug> <phase-slug> $i pending; done
# Reset the phase status back to pending
anchored phase status set <slug> <phase-slug> pending
```

Then re-run `/impl-build`. Orchestrator sees pending phase, treats as
fresh. implement does its full work.

For full task reset (rare): edit the task-file's `retry_count` keys
to 0 (the parser passes through unknown fields; the factory's
`increment_retry` will pick up from 0 next time).

## References on demand

- `references/task-file-schema.md`
- `references/state-mutations.md`
