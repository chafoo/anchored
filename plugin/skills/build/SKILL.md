---
name: build
description: Execute the build stage of an anchored node — orchestrate its children to completion in-session, spawning the build agents and driving the failures-driven re-do loop. Triggers ONLY on the explicit `/a:build <slug>` command. Use for `/a:build`, not for general "build the app" requests.
---

# /a:build — fractal build stage (skill-orchestrated)

Explicit-only: the user typed `/a:build <slug>`.

The skill is the **orchestrator**: it runs in-session (it has the plugin + agents
loaded), consults the `anchored` CLI for the deterministic step-plan + all node
ops, and spawns each worker itself via the **Task tool**. The CLI never spawns
agents — a headless subprocess can't reach the session's Task tool. Agents
self-write their results via `anchored node …` (see
`plugin/references/agent-contract.md`).

## Pre-flight

1. `anchored node read <slug>` — the **tier is derived from the node**. (A
   missing `anchored.yml` is fine — the CLI falls back to the framework defaults;
   it lazy-inits a minimal one + the `Bash(anchored *)` allowlist on first use.)
2. State gate: `refined` → flip up front `anchored node set-status <slug> build`
   (so the terminal `build → wrap` is legal); `build` → resume directly; `plan`/
   `drafted` → tell the user to run `/a:plan` + `/a:refine` first; `wrap`/`done`
   → already past build.

## Get the orchestration plan

```bash
anchored build <slug>      # → { stage, tier, node, steps }   (does NOT spawn)
```

`steps` is the resolved, config-driven plan. For a **looping tier** it is a single
`{ kind: 'loop', each: <child-tier>, stop, retry_limit }` — that is the recursion
edge you drive below. For a **leaf phase** it is the worker pipeline
(`implement → task-validate → code-validate`).

## Drive the loop (task.build.each: phase / epic.build.each: task)

While `anchored node next-child <slug>` returns a child (else done):

1. **Mark in-progress:** `anchored node set-child-status <slug> <child> in-progress`.
2. **Per-child body:**
   - **task → phase** (leaf): `anchored steps phase build` gives
     `[implement, task-validate, code-validate]`. Spawn **build-implement** via the
     Task tool with the agent-contract input `{ task-slug: <slug>, phase-slug:
     <child>, tier: phase, stage: build, context, rules }`. It writes code +
     self-writes evidence: `anchored node add-phase-evidence <slug> <child> <ac-id>
     "<proof>"` per AC. Then spawn the two gates **in parallel** (build-task-validate
     + build-code-validate) — pure inspectors.
   - **epic → task**: recurse the child task through plan→refine→build→wrap (JIT —
     a stub becomes a real task-file at its task.plan). Use `/a:plan`-style
     orchestration per task.
3. **Gates + failures (the re-do loop):** the gates REJECT a bad AC by self-writing
   `anchored node set-failures <slug> <phase> <ac-id> "<why>"` — that flips the AC
   back to `pending` with its `failures` recorded. Read the child back
   (`anchored node read <slug>`); for each AC carrying `failures`, re-spawn
   build-implement with those failures as the fix-list, then re-run the gates. Retry
   up to `retry_limit` (default 3); on exhaustion → blocked (see Failure-handling).
4. **Advance:** when all the child's ACs are `done` (with evidence) and both gates
   pass → `anchored node set-child-status <slug> <child> done`.

## Emergent decisions → document or stop (the decision-trail)

build runs maximally autonomous, but **every emergent decision lands on the
record** — that is the USP ("every decision on the record"). The build-implement
worker self-reports decisions the plan didn't fully nail down (which library, which
error shape, extend-vs-replace) in its build-notes (`append-log <slug> build
learning "…"`). For EACH such decision, run the **stop-check**:

- **Does it match a `build.stop` rule?** (the `stop[]` array comes from `anchored
  steps <tier> build`; the shipped default is *"a decision deviates from the
  plan"*.) Judge the decision against those rules — a genuine plan/architecture
  deviation matches; a within-plan local call does not.
- **No match → proceed + document autonomously:** mint/resolve a question so the
  decision + its WHY are on the record (read by `/a:wrap`):
  ```bash
  anchored node add-question <slug> "<the decision>" high          # → q<n>
  anchored node resolve-question <slug> q<n> "<the decision>" ai "<why, the reasoning>"
  ```
  (`resolve-question` with `source=ai` REQUIRES the reasoning — the substrate
  rejects an AI decision with no recorded why.) Then keep building.
- **Match → STOP + escalate:** `anchored node add-question <slug> "Build halted by
  stop-rule: <decision>" high`, surface it to the user, walk it
  (`resolve-question … user "<answer>"`), then continue. Minimise stops — proceed-
  and-document within-plan calls; stop only on a genuine deviation.

## Failure-handling (never silent — a5)

- **Agent returns nothing / errors** → treat as a failed AC: record it as a
  `failures` entry and retry (counts toward `retry_limit`).
- **retry_limit exhausted** → `anchored node set-child-status <slug> <child>
  blocked`, note what was tried in `anchored node append-log <slug> build blocker
  "<phase> blocked after N attempts: <ACs>"`, then continue with the next child
  (the wrap reviewer surfaces blocked phases). Retry-exhaustion is a bounded
  mechanical limit, NOT a stop.
- **stop-condition** (a worker flags a decision matching a `build.stop` rule, e.g.
  *"a decision deviates from the plan"*) → **halt** the loop, record the decision
  `anchored node append-log <slug> build decision "STOP: <decision>"`, surface it to
  the user, and walk it before continuing. Minimise stops — proceed-and-document
  within-plan calls; stop only on a genuine deviation.

## Workflow mode (fan-out) — allowlist precondition

When a phase carries `executor: workflow` (set via `anchored node set-executor
<slug> <phase> workflow`) and the `Workflow` tool is available, the children fan
out as a background workflow (≤16 parallel); each unit self-writes evidence/
failures via the CLI; the gates run **once** over the merged result. **Hard
precondition: `Bash(anchored *)` must be pre-approved on the allowlist** — a
background workflow has no interactive session, so an un-allowlisted `anchored`
call hangs. If unavailable, fall back to the sequential implement path (never
hard-error).

## Termination

When `next-child` returns null and at least one child is `done` (none
in-progress): `anchored node set-status <slug> wrap`. Tell the user: *"Build
durch. P done / Q blocked. Status: wrap. Run `/a:wrap`."* No MCP, no raw
node-file edit — every mutation goes through the `anchored` CLI.
