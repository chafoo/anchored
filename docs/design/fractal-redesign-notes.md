# Anchored Fractal Redesign — Working Notes

> Status: design phase (as of 2026-06-10). Companion drafts:
> `docs/drafts/fractal-lifecycle.md` + `docs/drafts/anchored.default.yml`.
> This note records *what* was discussed + decided and *how* we
> build it. Lives under `.claude/temp/` (working doc, not final).

## The big turn

anchored becomes a **fractal, pure framework**:

- **ONE** lifecycle form — `plan → refine → build → wrap` — applies on
  **every** tier.
- **4 tiers**: `project ▸ epic ▸ task ▸ phase` (project only later).
- **No more privileged built-ins.** Everything is a step. The opinionated
  behavior (implement, validators, scaffold …) is the **default template**
  (`anchored.default.yml`) — active by default, fully overridable/replaceable.
- **Mechanism vs. policy:**
  - *Mechanism* (substrate, fixed): tier form, state machine, data model
    (`fields`), atomic-writes, audit-trail.
  - *Policy* (steps, swappable): WHAT happens in each stage.

## Hard invariant (substrate, not switchable off)

An `ac` only goes to `done` when `evidence` is present. → anchored's promise
("no claim without verification") sits in the **data model**, not in a step.
This makes "everything configurable" true **without** losing the core value.

## Transport: CLI-over-Bash — DECIDED (MCP out)

- **Decision (2026-06-10, Option A)**: MCP out entirely. *All* ops run
  over the `anchored` CLI, invoked via **Bash**. Rationale (confirmed by
  the CC guide): MCP-in-subagents is broken (#13605, no fix/flag);
  CC built-ins are native + not extensible for plugins; **Bash is the
  only ubiquitous tool** (main session *and* subagents). A CLI-over-Bash
  effectively behaves like a built-in.
- **Consequence**: the pure-thinker workaround falls away — agents read + write
  directly via `anchored …`. One transport, one mental model, CI-/headless-capable.
- **Core factory remains** the value (schema, state machine, atomic-writes,
  invariant) — just transport-agnostic behind the CLI.
- **Friction**: `Bash(anchored *)` allowlist via lazy-init in
  `.claude/settings.local.json`; CLI outputs JSON.

## The model

- Each tier = top-level block with `plan/refine/build/wrap`; each stage =
  `steps` list.
- `build.each: <tier>` = fractal edge, **intrinsic** (fixed per tier, not
  configurable, docs only). `build` without `each` = leaf (`phase`) → runs once.
- `stop` + `retry_limit` = properties of a **looping** `build`.
- `fields` **per tier** = data model (default + custom over the same
  mechanism). Replaces the global `_fields` bucket.
- Step grammar unchanged: `name` + (`run` XOR `use`+`type`) +
  `instructions`; `involve` on `walk`. Markdown content = YAML block-scalar
  (`|`), no mix — parser/renderer can already do this today.

### Default steps + fields per tier (= `anchored.default.yml`)

- **phase**: build=[implement, task-validate, code-validate]; plan/refine/wrap
  empty. fields: name, slug, status, context, rules, acceptance_criteria,
  evidence, failures.
- **task**: plan=[discover, rules-scan, decompose]; refine=[plan-check,
  rules-check, walk]; build=each:phase + stop + retry_limit:3;
  wrap=[review, summarize]. fields: schema_version, slug(kebab|nested), title,
  created, status, context.{plan,refine,build,wrap}, questions,
  decisions(view), log, phases.
- **epic**: plan=[scaffold]; refine=[walk]; build=each:task + stop +
  retry_limit; wrap=[roll-up]. fields: schema_version, slug, title, status,
  goal, acceptance, questions, tasks(stubs), log.
- **project** (later): scope / walk / each:epic / roll-up.

## Plan entry + epic/task classification (Item 1 — DECIDED)

- **Entry**: `/impl-plan <epic|task>? <plan: prose | path>`. Tier argument
  optional.
- **Without tier**: `discover` → `classify` (recommendation) → user confirms → then
  structuring of the chosen tier.
- **`discover`** = shared plan kickoff to *both* tiers:
  `epic.plan = [discover, scaffold]`, `task.plan = [discover, rules-scan, decompose]`.
- **`classify`** = routing logic in the entry skill, **not** a persisted step.
- **Structure definition**: `task` = 1 task-file (`.claude/tasks/<slug>.yml`) with
  phases; `epic` = multiple task-files under `_epic.yml`
  (`.claude/tasks/<epic>/<slug>.yml`).
- **Detection** = phase count (tripwire) + independence test (judgment):
  - `<5` phases → default `task`
  - `5–9` → independence test ("does each unit need its own
    plan→refine→build→wrap?"); if yes → `epic`
  - `≥10` → split (`epic`), user can override
- **Escalation `task → epic`** is fractally cheap (lift by one tier:
  phase→task, task→epic, same shapes). Auto-escalation mid-build = **v2**;
  manual (re-plan) for v1.

## `anchored.default.yml` = the foundation

The MCP must be built so that it can implement **everything** from
`anchored.default.yml` — every step, every field, every stage there is a concrete
requirement on the engine + the substrate. The default file is the contract.

## Storage / roles

- `anchored.default.yml` → shipped **reference** (`plugin/references/`),
  **not** copied into the user project (defaults are immutable → a copy would be
  noise + drift).
- lazy-init → **minimal** `anchored.yml` (schema directive + pointer to the
  reference).
- **Standard user**: never needs it (zero-config). **Power user**: reads it to
  understand. **Setup AI**: reads it as spec, to generate the delta `anchored.yml` for the
  user (onboarding without learning the format).

## Open (to be decided)

1. **steps-alongside-each semantics**: loop as a positionable built-in step
   (`{ name: loop, each: task }`); custom steps before/after; per-child logic in
   the child tier. → to be confirmed.
2. **Ops namespace**: separate `task`/`epic` CLI groups OR a tier-generic
   core with per-tier surfaces, now that everything is fractal? → to be decided.
3. **Execution substrate of the loop**: does `build.each` run each child unit as
   an in-process **Task subagent** (lightweight, session-bound, observable) OR as
   a headless **`claude -p` instance** (real isolation, CI-/script-capable, but
   more expensive + nested processes)? → **RESOLVED: in-session Task subagent
   only** (`remove-headless-engine-path`). The headless `claude -p` path was tried
   and removed — a headless subprocess can't reach the session's Task tool.

## Parking lot (ideas, later)

- **PreToolUse hook as integrity guard**: refuse raw `Write`/`Edit` on
  `.claude/tasks/**` + `_epic.yml` → enforces that all mutations go
  through the validating CLI. Skipped for now. (Subagent hook
  propagation still open.)

## What changes in the existing system

- **Functionally for the user**: `task`/`phase` behavior stays the same.
- **Internally**: the substrate becomes tier-generic (one `createNodeOps` for all
  tiers); built-ins → template steps (config-driven dispatch instead of hardcoded);
  new substrate invariant; `anchored.yml` schema flat → fractal; `fields` per
  tier; `epic` is "one tier higher" with its own steps + data. The loop /
  orchestration is the in-session **skill's** job, not an engine's
  (`remove-headless-engine-path`).

## Agent roster + buckets (Item 4 — DECIDED)

- CC supports **no agent subfolders** (only flat in `agents/`, verified
  via CC guide). → bucketing via **name prefix**, not folder.
- The roster is a **flat set of distinct workers**, named after what they
  do:
  - **shared / tier-parameterized** (1 file, tier+input passed through):
    `discover`, `plan-check`, `rules-check`, `walk`, `review`, `summarize`.
  - **tier-specific** (own files): `decompose`(task), `scaffold`(epic),
    `scope`(project), `implement`/`task-validate`/`code-validate` (only
    leaf/phase), `roll-up`(epic).
- Higher `build` tiers have **no** worker — their build is the `each` loop
  (orchestration). Real code workers only at the leaf.
- Prefix scheme by stage where sensible (`plan-…`, `refine-…`, `build-…`,
  `wrap-…`, `epic-…`).

## Engine architecture (Item 3 — DECIDED, then REVISED)

Detail + diagrams: `docs/design/engine-architecture.md`.

> **REVISED (`remove-headless-engine-path`):** the engine-drives-AI chain below
> was built and then **removed**. The orchestrator is the **in-session skill**;
> the core keeps only the substrate + ops + the `anchored` CLI. See the per-bullet
> notes.

- **Fractal factory functions** (trader pattern): the `createX(cfg, deps) →
  { run(input) → output }` form **stays** for the surviving core (`createNodeOps`,
  `createStepsPlanner`, `createValidator`, `createCli`); helpers in `scope/`.
  ~~`createEngine → createTierRunner → createStageRunner → createStepRunner`~~ —
  **ABANDONED**: a headless `claude -p` subprocess can't reach the session's Task
  tool, so the engine could never spawn the workers it orchestrated (dogfood F11 /
  architecture-cleanup A8). `createAnchored(deps)` now returns `{ cli, ops, config }`.
- ~~**Two fractals, same form**: runtime + code; `loopStep` closes the recursion~~
  — **ABANDONED**: the loop + fan-out live in the **skill** (Task / Workflow tools),
  not in a recursive engine.
- **Separation stays in spirit**: the core is deterministic, fully-tested code
  (parse, resolve-steps, validate, transitions, atomic-write, invariant). The AI
  is an **effect the skill runs in-session** — never inside the core, never behind
  a `spawn` dep anymore (~~`spawn` agent | `claude -p`~~ removed).
- **Substrate remains** (`createNodeOps`, parser, validate, io). ~~`spawn` is the
  new dep~~ — removed. The per-stage orchestration plan (which steps, which worker)
  comes from the steps-planner; the skill executes it.
- Folders: ~~`core/engine/{engine,tier-runner,stage-runner,step-runner}.ts` +
  `core/engine/scope/{run-step,worker-step,loop-step,resolve-steps}.ts`~~ →
  only `core/engine/scope/resolve-steps/` survives (pure step-resolution config);
  the worker roster lives in `core/ops/scope/worker-dispatch/`.

## Execution substrate (Item 2 — DECIDED, then ABANDONED)

> **ABANDONED (`remove-headless-engine-path`):** the headless `claude -p`
> execution substrate below was removed. A headless subprocess can't reach the
> session's Task / Workflow tools, so the in-session **skill** is the executor —
> it spawns each task/phase worker via the Task tool (and may fan out via the
> Workflow tool, hinted by the node's `executor` field). The original bullets are
> kept for the record:

- ~~**`spawn` = headless `claude -p`**, granularity **per task-file** (each
  task-file = a fresh instance), **phases in-process** within that
  instance → nesting capped at ~2.~~
- ~~`spawn` remains an **injected seam** → an in-process Task subagent mode (live
  progress, session-bound) can be added later as a second implementation,
  without touching the runners.~~ → The in-session path is now the **only** path;
  there is no `spawn` seam.
- Consistent with q6: a task still runs isolated / epic-blind; cross-task context
  (an epic-log excerpt) comes in as an argument the skill passes to the worker.
- ~~Price accepted: full instance per task (startup/tokens); headless auth must
  be running.~~ → Not applicable: the skill spawns in-session subagents, no
  headless instance.

## steps/each semantics (Item 5a — DECIDED)

- `each: <tier>` is a **step attribute**, not build-stage-level.
  `build.each: task` is only **shorthand** for a single `loop` step.
- The `loop` step has `each` **+ a `steps` body** that runs **interleaved** per
  child: all body steps for child A, then for child B (A→run→commit,
  B→run→commit, …). NOT the pass model (first all run, then all commit).
- In the body, `{ name: run }` is the "drive this unit" step. ~~(headless
  spawn)~~ → **the in-session skill drives it** via the Task / Workflow tools
  (`remove-headless-engine-path`), around which custom steps are positionable.
- Per-iteration mechanics (advance status, log, stop-check) are driven by the
  **skill** after the body of each iteration; the CLI resolves the body's steps
  per child and performs the status/log writes through the ops.
- Shorthand `build: { each: task }` = loop with implicit body `[run]`.
- ~~Engine: `loopStep` reuses `stepRunner` on the body → fractal, one level
  deeper.~~ → **ABANDONED**: the loop lives in the skill; the CLI just re-resolves
  the body's plan per child (one tier deeper). Detail in
  `docs/design/engine-architecture.md`.

## Ops namespace + config-as-base-dep (Item 5b — DECIDED)

- **Tier-generic op core**: one `createNodeOps(tierSchema, deps)`,
  parameterized over a tier-schema descriptor. Outward **readable
  per-tier CLI surfaces**: `anchored task|epic|phase <verb>`. Supersedes q21
  (strictly separated) — logic once, not duplicated 3×; project free on top.
- **Tier-schema descriptor = code mechanism + config fields**:
  - *Code/substrate (fixed)*: status enum, state-machine transitions, child relationship
    (task→phase), hard invariant (no `done` without `evidence`).
  - *Config (anchored.yml)*: the fields (shape) — default fields from
    `anchored.default.yml` + user custom fields, merged at load. Builds on the
    existing `_fields`/phase-field machinery.
- **`anchored.yml` is *the* base dependency**:
  `effectiveConfig = merge(anchored.default.yml [framework base], <project>/anchored.yml [user deltas])`
  — loaded + validated once at **bootstrap**, then injected as `deps.config` into all
  surviving factory functions (createNodeOps / createStepsPlanner / createCli / createAnchored / …). That's why the minimal
  user `anchored.yml` suffices: anything not overridden comes from the default base.

## v2 repo + command naming (DECIDED/clarified)

- **v2 = new repo `~/Dev/anchored-v2`** (clean-slate rewrite). v1 stays live
  on npm/marketplace until v2 is ready (then new `main` / major bump). No
  in-place rebuild of the running v1.
- **Naming (verified by the CC guide)**:
  - `/plan` is a **built-in** (plan mode); `/refine`/`/build`/`/wrap` currently
    free but generic.
  - Agent types **`Plan` + `Explore` are reserved** → never name custom agents
    that way (shadowing). Our roster avoids this.
  - Plugin commands/skills are **always namespaced** (`/anchored:…`), built-ins
    not overridable.
  - **DECIDED — plugin name `a`** (fallback `anc`, if single-letter
    plugin names are not allowed → verify at scaffold). Command surface:
    ```
    /a:plan   <epic|task|phase>?  <prose|path>   # tier optional → otherwise classify
    /a:refine <slug>                              # tier derived from the node
    /a:build  <slug>
    /a:wrap   <slug>
    ```
  - **No separate tier entries** — the tier is an argument of `plan`.
  - Stage word stays **`plan`** (recognizability; via namespace `/a:plan` it's
    collision-free anyway). `refine/build/wrap` stay. Agents still never named
    `plan`/`explore` (reserved agent types).

## Plan forward

- `impl-epic-layer` (status: refined) is substantively **outdated** — still describes
  the old built-in world. → back to `drafted` + restart, OR a new
  precursor task "pure engine + substrate + default template", then `epic`
  on top.
- **Supersedes** from the old plan: q2 (built-ins fixed), q5 (plan→task rename —
  `plan` stays `plan`), parts of q17.
