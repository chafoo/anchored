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
   - `status: refined` → **flip `refined → build` now**
     (`mcp__task__set_task_status(project_root, slug, "build")`), then
     proceed. This is the normal entry; the task must run with status
     `build` so the terminal `build → wrap` transition is legal. The
     state machine is forward-only — a task left at `refined` cannot
     jump straight to `wrap` at termination, so the flip happens up
     front, not at the end.
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

**Branch the primary worker on the phase's `executor` field.** Each
phase carries an optional `executor` (schema: `Phase.executor`,
values `implement` | `workflow`; absent ⇒ `implement`). This is the
ONLY decision that changes how the primary worker runs — everything
downstream (the validators in section 3, the re-do loop in section 4,
the outcome eval in section 5) is identical for both executors.

```
if (phase.executor === 'workflow' && workflowsAvailable())
    → run the WORKFLOW DISPATCH path  (section 2-WF below)
else
    → run the IMPLEMENT path          (the unchanged bullet below)
```

`workflowsAvailable()` is the empirical feature-detection check
described in section 2-WF — when it returns false (or the dispatch
errors at runtime), the `executor: workflow` phase **falls back to
the IMPLEMENT path**, never hard-errors. The IMPLEMENT path below is
the original single-agent path, **preserved verbatim** — the workflow
path is a strict sibling, not a refactor the two modes share.

For each user step (declaration order in anchored.yml):

- **`implement`** (the IMPLEMENT path / `executor` absent or
  `implement`, or any executor falling back) — spawn the `implement`
  agent with:
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

### 2-WF. Workflow dispatch path (only when `executor: workflow`)

This is the **sibling** of the IMPLEMENT path above — reached only
when `phase.executor === 'workflow'` AND workflows are available. It
fans the phase's acceptance criteria out across parallel `workflow`
unit-workers (`plugin/agents/workflow.md`), each of which writes its
OWN evidence/failures to the task-file via the `anchored` CLI. Unlike
the IMPLEMENT path, this path applies NO MCP returns per worker — the
workers already wrote to disk; you reconcile at the end.

The per-phase loop branched here at the top of section 2. The custom
user steps above still run for a workflow phase exactly as written —
only the `implement` primary-worker step is replaced by this dispatch.

#### A. Feature-detection — `workflowsAvailable()`

Before dispatching, verify EMPIRICALLY that the Dynamic Workflow
runtime is usable. There is **no `disableWorkflows` config flag** to
read — detection is by probing the runtime, not by an assumed setting:

1. **Workflow tool present?** Is the `Workflow` tool available in this
   session at all (supported Claude Code version with a Workflow
   runtime)? If the tool is absent → unavailable.
2. **`agentType` resolvable?** Can the runtime resolve
   `agentType: 'anchored:workflow'` to the `plugin/agents/workflow.md`
   worker, and does that worker get the `Bash` tool (without Bash it
   cannot invoke the `anchored` CLI and the whole write-contract
   collapses)? If `agentType` does not resolve, or Bash is not
   granted, the dedicated-worker form is unusable — try the inline
   fallback form (step C below) before giving up on workflows.
3. **Dispatch error at runtime?** If the actual dispatch throws
   (runtime rejects the workflow, the unsupported-version error
   surfaces only on first call, etc.) → treat as unavailable.

`workflowsAvailable()` returns **false** on cases 1 and 3, and on
case 2 only when BOTH the dedicated-agent form AND the inline-prompt
fallback form (step C) fail. On false:

> **Fall back to the IMPLEMENT path.** Run the unchanged
> single-`implement`-agent step (section 2, IMPLEMENT bullet) for this
> phase exactly as if `executor` were `implement`. Then emit ONE
> partner-voice line noting the fallback, e.g. *"Phase X wollte als
> workflow laufen, aber der Workflow-runtime ist hier nicht verfügbar
> — ich mach's sequentiell mit dem implement-agent."* and append a
> machinery note to `context.build → Implement` via
> `append_build_section` recording the fallback + the detection reason
> (which of cases 1/2/3 fired). **Never hard-error on an unavailable
> workflow.**

This fallback is the same end-to-end chain the `workflow.md` worker
documents under "Runtime resolution is UNVERIFIED".

#### B. Plan the fan-out units

A **unit** = one acceptance criterion that still needs work. Build
the unit list by reading the phase's current ACs (the pre-read
task-file content from section 2's top):

- **Skip** any AC whose `status: 'done'` with non-empty evidence and
  no `failures` — already satisfied (resume-safety; see D).
- **Include** every AC that is `pending`, or has a `failures` field
  (retry target — pass its `failures[]` into the unit so the worker
  addresses the validator's prior complaints).

Each unit payload (per `plugin/agents/workflow.md` "Input"):
PROJECT_ROOT, TASK_SLUG, PHASE_SLUG, UNIT `{ ac_index, ac_text,
failures? }`, PHASE_CONTEXT `{ rules[] }`, TASK_CONTEXT `{ intro,
plan, resolved_questions[] }`, USER_EXTENSION
(`anchored.yml.build.implement` prose), RETRY_ATTEMPT
(`phase.retry_count + 1`).

**Hard-coded fan-out ceilings (not configurable):** at most **16
units run in parallel** at once, and at most **1000 units total**
across the phase. If a phase has more than 16 pending units, dispatch
in waves of ≤16 and join each wave before the next. If a phase
somehow declares more than 1000 ACs, that is a malformed plan — stop
and surface it; do not attempt the fan-out.

#### C. Dispatch the workflow

Spawn the Dynamic Workflow via the **`Workflow` tool**, with the
fan-out body issuing one `agent()` call per unit at
`agentType: 'anchored:workflow'` (this is **separate** from
`anchored.yml` step dispatch — there is no generic `use:`-dispatcher;
the workflow worker is reached only through this `agentType`):

- **Primary form:** `agent({ agentType: 'anchored:workflow', ... })`
  per unit, parallel up to the ≤16 ceiling.
- **Inline-prompt fallback form** (feature-detection case 2 — when
  `agentType: 'anchored:workflow'` does NOT resolve, or the resolved
  worker lacks Bash): dispatch the runtime's **default** workflow
  subagent with an **inline prompt that carries the identical
  write-via-CLI contract** (steps 1-6 of `plugin/agents/workflow.md`,
  reproduced inline). The worker still performs its unit and still
  writes its own evidence/failures via the `anchored` CLI; only the
  spawn mechanism differs.

**Pre-approval is mandatory.** A background workflow has no one to
answer an interactive permission prompt. The exact `anchored` CLI
commands the unit-workers invoke for evidence/failures —
`anchored ac evidence set ...` and `anchored ac failures set ...` —
**must be pre-approved in the tool allowlist** before the workflow
runs (see section 2-WF/F and EXTENDING.md). If a unit-worker would
block on a permission prompt, that is a dispatch-config failure, not
something to wait on.

**On dispatch, emit ONE short partner-voice progress line** and then
go quiet until phase-end (no per-unit chatter):

> "Phase X läuft als workflow — N units parallel."

**Then RETURN.** Do NOT spin in an active poll-loop waiting on the
workflow. The await mechanism is **re-invocation, not polling**: the
skill dispatches, returns, and is **re-invoked when the workflow
completes** (or on the next `/impl-build` run after a crash). On every
entry it reconciles against task-file evidence (section D) — that is
the entire await/collect mechanism.

#### D. Collect + reconcile (resume-safe, re-invocation-driven)

**There is no mid-run interaction with a workflow phase.** A
background fan-out has no one to answer a prompt and the skill is not
in the loop while units run (it returned at dispatch, section C). So
everything a unit "raises" — its evidence, its honest `failures`, and
any decision it had to make — is **buffered in the task-file**, never
surfaced live:

- A unit that hits a blocker writes it via `anchored ac failures set`
  → lands in that AC's **`failures[]` field** (the same per-AC surface
  the sequential path's validators write).
- A unit that needs to flag an ambiguity/decision the plan didn't
  nail down records it as a question via the CLI (`anchored task
  question add <slug> --text '<the decision>' --priority high --origin
  stop-check --phase <phase-slug>`) → lands in the task-file's existing
  **`questions[]` array**, marked `status: open`. (Origin `stop-check`
  is the build-time-decision origin the schema already defines — the
  same origin the sequential path mints for a worker-self-reported
  decision; there is no separate `workflow` origin and none is added.)

No new schema field is introduced for buffering (per resolved q5,
**reuse the existing surfaces** — the per-AC `failures[]` and the
`questions[]` array — both already persisted, both already survive
re-invoke/crash). The skill reads these buffered items **only here at
phase-end**, when it re-engages; it never interrupts mid-fan-out. This
is what "buffered to phase-end" means concretely: write-to-task-file
during the run, read-from-task-file at the gate.

When the skill re-engages for this phase (workflow joined, OR a fresh
`/impl-build` invocation lands on this in-progress phase):

1. **Re-read the task-file** via `mcp__task__read` — it is the single
   source of truth. The unit-workers wrote their evidence/failures
   directly to it via the CLI; there is **no per-worker structured
   return for you to apply** (this is the inverse of the IMPLEMENT
   path — do NOT call `set_evidence`/`set_failures` for workflow
   units; doing so would double-apply).

2. **Determine remaining work.** For each AC: `done` + evidence + no
   `failures` ⇒ satisfied, skip. Anything still `pending` or carrying
   `failures` ⇒ **not yet evidenced** — re-dispatch ONLY those units
   (back to step B, building the unit list from current state). Units
   already evidenced are never re-dispatched, so re-invocation neither
   loses nor double-applies results: the workers themselves no-op on
   an already-evidenced unit (their step 1), and you re-dispatch only
   the gaps. This makes the collect step idempotent across
   re-invocation, crash, and compaction.

3. When the unit list from step 2 is empty (all ACs evidenced, or the
   remaining ones recorded honest `failures`), the fan-out is joined.
   Proceed to section 3 (the gates).

> **Documented V0.3 limitation (per resolved q14):** if the session
> crashes or is compacted *mid-fan-out*, in-flight workflow state is
> lost (the runtime restarts the workflow fresh on resume, it does not
> replay in-flight unit state). Resume-safety is therefore
> **task-file-evidence-driven**: on re-invocation we re-dispatch only
> the not-yet-evidenced units. Within-session workflow-resume is
> best-effort; we deliberately do NOT build extra cross-session
> workflow-state persistence in V0.3. The evidence-on-disk model makes
> this safe-but-possibly-repeats-an-in-flight-unit, never
> lose-or-corrupt.

#### E. Gates run ONCE over the merged phase result

After the fan-out joins, **section 3 runs unchanged**: spawn
`task-validate` + `code-validate` in parallel **ONCE over the merged
phase result** — they evaluate the phase's ACs as a whole, exactly as
the sequential IMPLEMENT path runs them once per phase. The gates are
**never run per-unit and never bypassed** for a workflow phase. The
failures-driven re-do loop (section 4) and outcome eval (section 5)
likewise run unchanged: a validator-rejected AC gets a `failures`
field, which step D step 2 picks up as a not-yet-evidenced unit on the
next dispatch wave. Retry accounting (`increment_retry`, the
`retry_limit` ceiling) stays at the orchestrator layer for the phase
as a whole — identical to the IMPLEMENT path.

#### E-bis. Buffered decisions route through the SAME stop-check seam

The buffered items from step D (the unit `failures[]` and the open
`questions[]` a unit recorded) are **not** handled by a workflow-only
gate. There is **no `ask_*` / `decide_all` autonomy model** — that was
removed; do not reintroduce it. Instead, at phase-end a workflow phase
feeds those buffered items into the **exact same section-4 flow the
sequential path uses**:

- **Buffered `failures[]`** → section 4's *failures-driven re-do loop*
  (step 3). The orchestrator retries autonomously: `increment_retry`,
  and while `N ≤ retry_limit` (default 3) re-dispatch — for a workflow
  phase that means re-dispatching **only the not-yet-evidenced units**
  (step D step 2 rebuilds the unit list from current state; passing
  units keep their evidence and are never re-run). When `N >
  retry_limit`, the phase is **blocked** — identical to the sequential
  path's retry-exhaustion handling.

- **Buffered open `questions[]`** (a unit's emergent decision, plus any
  ambiguity the validators raised over the merged result) → section 4's
  *emergent-decision handling* (step 4). Each is an emergent decision
  the plan didn't predict, so each runs through the **`stop-check`
  evaluator** against the global `anchored.yml.build.stop` rules, and
  the verdict is routed through `classifyStopVerdict`:
  - **`proceed`** → resolved **autonomously**:
    `mcp__task__question_resolve(..., { source: 'ai', reasoning: '<the
    evaluator's reasoning>' })`. The build keeps going; the decision
    lands in the decisions log `/impl-wrap` reviews. (A
    worker-self-reported deviation forces a stop via the second-eye
    override, exactly as in section 4.)
  - **`stop`** (a buffered decision matches a `build.stop` rule) →
    **escalate to the user**, do not auto-resolve:
    `mcp__task__question_add(...)` then halt and walk it via
    `AskUserQuestion`, resolving `source='user'`. After the user
    weighs in, re-dispatch the affected units and loop back.

  This is the whole point of resolved q18: workflow buffering changes
  only **when** a decision surfaces (phase-end, not mid-run), never
  **how** it is judged. The stop-check seam is the single shared gate
  for both executors, applied **per-phase at the gate, not per-unit**.

So a workflow phase reaches section 4 with its buffered failures and
questions already on the task-file; section 4 then drives retry +
stop-check exactly as written, with the only workflow-specific detail
being that "re-spawn implement" becomes "re-dispatch the
not-yet-evidenced units" (step D step 2).

#### F. Tool-allowlist pre-approval (operational requirement)

For a background workflow to run without hanging, the `anchored` CLI
evidence/failures commands the unit-workers invoke **must be on the
tool allowlist ahead of time**. Document this for the user (see
`plugin/EXTENDING.md` → "Running phases as a Dynamic Workflow"). The
relevant commands are:

```
anchored ac evidence set *
anchored ac failures set *
```

(or the broader `anchored ac *` / `anchored *`). Without pre-approval
the first unit-worker would block on a permission prompt with no one
to answer it, stalling the whole fan-out.

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

This section is **executor-agnostic** — it drives the re-do loop and
emergent-decision handling identically whether the phase ran via the
IMPLEMENT path or the WORKFLOW path. For a workflow phase the inputs
arrive *buffered* on the task-file (the unit `failures[]` and the open
`questions[]` a unit recorded; see 2-WF/E-bis) rather than from a live
implement return, and the retry action is "re-dispatch the
not-yet-evidenced units" instead of "re-spawn implement" — but the
retry accounting, the stop-check routing, and the
escalate-only-on-`build.stop`-match rule are the same.

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
- On `refined` entry (normal), flip `refined → build` up front
  (before the pipeline loop) so the terminal `build → wrap` is legal;
  accept `build` (resume) directly.
- Accept `drafted` only via the documented shortcut: warn + confirm
  with the user, then transition `drafted → build` before proceeding.
- Pick next phase via `task__next_phase` — handles in-progress resume
  automatically.
- Set phase status `pending → in-progress` at phase start.
- **Branch the primary worker on `phase.executor`** (section 2): a
  `workflow` executor fans out via the `Workflow` tool +
  `agentType: 'anchored:workflow'` (section 2-WF); `implement` or
  absent runs the unchanged single-implement-agent path. An
  `executor: workflow` phase **falls back to the implement path** when
  workflows are unavailable (empirical feature-detection) — never a
  hard-error.
- Route evidence writes by executor: the IMPLEMENT path routes through
  `mcp__task__set_evidence` (the implement agent is a pure thinker; YOU
  apply its return via MCP). The WORKFLOW path's unit-workers write
  their OWN evidence/failures via the `anchored` CLI (`createOps`, same
  factory + atomic lock) — so for a workflow phase you do NOT
  `set_evidence`/`set_failures` per unit; you reconcile against the
  task-file at phase-end (section 2-WF/D). Direct task-file edits are
  forbidden — no agent has Write or Edit on the task-file.
- Capture step outcomes / blockers to `context.build` via
  `append_build_section`.
- **ALWAYS spawn `task-validate`** after user steps — cannot disable
  (for a workflow phase: ONCE over the merged phase result, never
  per-unit).
- **ALWAYS spawn `code-validate`** after user steps — cannot disable
  (likewise ONCE over the merged phase result).
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
3. Spawn the primary worker on it (per `phase.executor`):
   - **implement path** — implement's Step 0 re-reads via
     `mcp__task__read`, sees which ACs already have status='done',
     skips them; sees ACs with `failures`, treats those as the re-do
     pathway.
   - **workflow path** — on re-invocation, reconcile against task-file
     evidence (section 2-WF/D): re-dispatch ONLY the not-yet-evidenced
     units. Already-evidenced units are skipped (the worker no-ops on
     them too). This is the resume-safe collect mechanism — it neither
     loses nor double-applies results across re-invocation. (Mid-fan-out
     crash/compaction is the documented V0.3 limitation in 2-WF/D.)
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
