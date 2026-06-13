# File Structure — anchored v2

> Authoritative structure spec. The docs (`/docu-plan`) mirror this structure;
> the build lays out the files along this map. Derived from
> `engine-architecture.md` + the decisions in `fractal-redesign-notes.md`.
>
> **Colocation + folder-naming convention** (binding): see
> `.claude/rules/colocation-and-naming.md`. As soon as a module gains
> companion files (spec, `scope/` helpers, types), it moves into its own
> folder and the main file is **named after the folder** (`io/io.ts`,
> `cli/cli.ts`, `codec/parse/parse.ts`) — never a folder-internal
> `index.ts`, never a barrel (`export * from …`). The single permitted
> `index.ts` is the package-root entry (`core/src/index.ts`). A spec always
> sits next to its subject.
>
> **Domain layout** (binding, current): `core/src/` is organised by
> responsibility layer — `domain/` (the pure substrate model), `store/`
> (persistence + node mutation), `orchestration/` (step/worker resolution),
> `config/` (the anchored.yml bootstrap loader), and `cli/` (the transport).
> The earlier folders `ops/`, `engine/`, `parser/`, `schema/`, `state/` were
> dissolved into these layers and **no longer exist as live source paths**.

## Top-Level

```
anchored-v2/
├── core/                  # the CLI/engine package (TypeScript, npm)
├── plugin/                # the Claude Code plugin (namespace `a`)
├── docs/                  # docs (macro/medio/micro) — built by /docu-plan
│   └── design/            # this design spec (source of truth for the model)
├── README.md
└── .gitignore
```

## core/ — Engine + Substrate + CLI

> Convention: a module with companions lives in its own folder named after it
> (`io/io.ts`); each test sits next to its subject under one of three kind-suffixes
> — `*.spec.ts` (unit), `*.int.ts` (integration), `*.e2e.ts` (end-to-end) — mostly
> omitted below for brevity. The suffix names the test kind; see
> `.claude/rules/test-file-naming.md`. `index.ts` appears exactly once — the
> package-root entry.

```
core/
├── package.json                 # @chaafoo/anchored · bin: anchored · (tooling choice in the build)
├── tsconfig.json
├── bunfig.toml                  # [test] root = "src" — the suffix taxonomy (spec/int/e2e) source of truth
├── tsconfig.build.json          # build excludes: src/**/*.{spec,test,e2e,int}.ts (no test ships)
├── src/
│   ├── index.ts                 # public entry (the ONLY index.ts): re-exports the public surface (tierOfNode …)
│   ├── bin.ts                   # #!/usr/bin/env node shebang entry → cli/cli.ts (+ the real file-lock)
│   ├── dogfood.e2e.ts           # drive a real task-file lifecycle against a real fs (end-to-end, cross-cutting)
│   ├── epic-tier.int.ts         # epic-tier scaffold/walk/loop/roll-up, in-memory (integration, cross-cutting)
│   ├── skeleton.spec.ts         # package skeleton / wiring smoke (unit, cross-cutting)
│   ├── index.spec.ts            # package-entry companion spec (beside index.ts)
│   │
│   ├── domain/                  # ── the pure substrate model (mechanism, fixed) ──
│   │   ├── tiers/                       # tier descriptors + tier derivation
│   │   │   ├── tiers.ts                 # tierOfNode (detect tier from a node) + makeTierFor (build a tier schema)
│   │   │   ├── phase.ts                 # Leaf: ac/status/context/rules/evidence/failures
│   │   │   ├── task.ts                  # status/context.{plan,refine,build,wrap}/questions/log/phases
│   │   │   ├── epic.ts                  # status/goal/acceptance/questions/tasks(stubs)/log
│   │   │   └── project.ts               # reserved, same form
│   │   ├── lifecycle/                   # ── stages + state machine ──
│   │   │   ├── stages.ts                # STAGES = plan|refine|build|wrap
│   │   │   └── transitions/transitions.ts  # per-tier transitions + assertTransition (forward-only)
│   │   ├── steps/                       # ── step grammar + step planning types + resolution ──
│   │   │   ├── step.ts                  # step grammar: name + (run XOR use+type) + instructions; TierName enum
│   │   │   ├── plan.ts                  # StepPlan / PlanStep types (the resolved step sequence shape)
│   │   │   └── resolve-steps/resolve-steps.ts  # insert the default template's steps + normalize order (pure config, no spawn)
│   │   ├── invariants/invariants.ts    # HARD invariant: no ac→done without evidence (at the data model)
│   │   └── config-schema/               # ── Zod schemas for the config shape ──
│   │       ├── config.ts                # anchored.yml schema (tiers, _lib aliases allowed)
│   │       └── custom-fields.ts         # extend a tier schema with user-declared fields
│   │
│   ├── store/                   # ── persistence + node mutation (mechanism, fixed) ──
│   │   ├── node-store/node-store.ts     # createNodeOps(tierSchema, deps): create/read/set-status/add-child/next-child/…
│   │   ├── node-router/node-router.ts   # createSlugFacade → NodeOpsFacade (the slug-based facade the CLI drives)
│   │   ├── children/children.ts         # add/move/next-child (dependency graph: first pending whose depends_on are all done)
│   │   ├── questions/questions.ts       # add/resolve question
│   │   ├── log.ts                       # append-only log
│   │   ├── validate/validate.ts         # node validation surface
│   │   ├── codec/                       # ── YAML <-> Node ──
│   │   │   ├── parse/parse.ts           # parseNodeYAML (two profiles: task-file no-alias, anchored.yml alias-ok)
│   │   │   ├── render/render.ts         # renderNodeYAML: schema directive + block-scalar for prose
│   │   │   └── roundtrip.spec.ts        # parse∘render roundtrip (codec contract, beside the pair)
│   │   └── io/io.ts                     # atomic-write: lock + mkdir -p + POSIX-rename
│   │
│   ├── orchestration/           # ── step/worker resolution (mechanism, fixed) ──
│   │   ├── steps-planner/steps-planner.ts  # resolve the concrete step sequence + worker per step for a stage
│   │   │                                    # (+ extensibility-matrix.int.ts: extend anchored without touching substrate)
│   │   └── worker-dispatch/worker-dispatch.ts  # DEFAULT_WORKERS roster: which agent a use: step maps to (a plan hint for the skill)
│   │
│   ├── config/                  # ── anchored.yml as base dependency (loader layer) ──
│   │   ├── bootstrap.ts         # effectiveConfig = merge(anchored.default.yml, user anchored.yml); once at startup
│   │   ├── merge.ts             # combine default base + user deltas
│   │   └── init.ts              # lazy-init of a user project (anchored.yml + settings)
│   │
│   ├── cli/                     # ── `anchored` CLI (the only transport, no MCP) ──
│   │   ├── cli.ts               # pure JSON dispatch (folder-named, not index.ts)
│   │   ├── cli.e2e.ts           # full CLI argv path against a real filesystem (end-to-end)
│   │   ├── stage.spec.ts        # spec for the stage verbs on the cli surface (beside cli.ts)
│   │   ├── lifecycle.int.ts     # full lifecycle of both tiers through the CLI, in-memory (integration)
│   │   ├── archive-reset.int.ts # archive/reset through the CLI argv path, in-memory (integration)
│   │   ├── epic-tier.int.ts     # epic-tier scaffold/walk/loop/roll-up through the CLI (integration)
│   │   ├── custom-field.int.ts  # user-declared fields through the CLI, in-memory (integration)
│   │   └── commands/
│   │       ├── stage/           # stage verbs: plan/refine/build/wrap/classify/steps
│   │       │   ├── plan.ts      # `anchored plan <tier?> <input>`
│   │       │   ├── refine.ts    # `anchored refine <slug>`
│   │       │   ├── build.ts     # `anchored build <slug>`
│   │       │   ├── wrap.ts      # `anchored wrap <slug>`
│   │       │   ├── classify.ts  # classify epic|task|phase when tier is missing
│   │       │   └── steps.ts     # inspect the resolved step sequence
│   │       ├── node/node.ts     # generic node verbs (read/set-status/add-evidence/log …) for agents
│   │       └── lifecycle/       # archive/reset + shared stage-lifecycle helper
│   │           ├── archive.ts       # archive a completed node
│   │           ├── reset.ts         # reset a node/stage
│   │           └── require-node.ts  # shared node-resolution helper for the lifecycle commands
│   │
│   │                            # (the `spawn` seam is gone — the headless `claude -p` path was removed;
│   │                            #  the in-session skill spawns workers via the Task / Workflow tools)
│   │
│   │                            # cross-cutting suites with no single subject sit at the package
│   │                            # root next to index.ts: dogfood.e2e.ts, epic-tier.int.ts,
│   │                            # skeleton.spec.ts (see top of src/); the remaining cross-cutting
│   │                            # tests colocated into cli/ (above) and orchestration/steps-planner/
│
└── default-template/
    └── anchored.default.yml     # the shipped default config (reference, not copied into the user project)
```

> Tests colocate with their subject under three kind-suffixes — `*.spec.ts`
> (unit), `*.int.ts` (integration), `*.e2e.ts` (end-to-end); see
> `.claude/rules/test-file-naming.md`. The **only** tests not next to a single
> subject are the cross-cutting suites, which sit at the package root next to
> `index.ts` (`dogfood.e2e.ts`, `epic-tier.int.ts`, `skeleton.spec.ts`);
> `index.spec.ts` stays beside `index.ts` as the package-entry companion.

## plugin/ — Claude Code Plugin (namespace `a`)

```
plugin/
├── .claude-plugin/
│   └── plugin.json              # name: "a" (fallback "anc") · brand/display see scaffold check
├── skills/                      # slash commands = skills → /a:plan /a:refine /a:build /a:wrap
│   ├── plan/SKILL.md            # /a:plan <tier?> <input>  · calls `anchored plan …` via Bash
│   ├── refine/SKILL.md
│   ├── build/SKILL.md
│   └── wrap/SKILL.md
└── agents/                      # flat, stage-prefix buckets (no subfolders — CC only scans flat)
    ├── plan-discover.md         # shared (tier-parametrized)
    ├── plan-decompose.md        # task: → phases
    ├── plan-classify.md         # epic|task|phase recommendation
    ├── refine-plan-check.md     # shared
    ├── refine-rules-check.md    # shared
    ├── build-implement.md       # Leaf
    ├── build-task-validate.md   # Leaf
    ├── build-code-validate.md   # Leaf
    ├── wrap-review.md           # shared
    ├── wrap-summarize.md        # shared
    ├── epic-scaffold.md         # epic: → stubs
    └── epic-roll-up.md          # epic: definition of done + retro
```

> Reserved/taboo: **never** name agents `plan`/`explore` (CC-reserved
> agent types). `walk` is skill-routing logic, not an agent.

## Mechanism vs. Policy (where what lives)

- **Mechanism (code/substrate, fixed)**: `domain/` (tier mechanics in
  `domain/tiers/*` — status enum, the `domain/lifecycle/transitions/`, the
  `domain/invariants/` hard invariant, `domain/steps/resolve-steps/` step
  resolution), `store/` (node mutation + `store/codec/` parse/render +
  `store/io/io.ts` atomic-write), and `orchestration/` (step/worker resolution).
  The engine-run chain + the `spawn` seam were removed
  (`remove-headless-engine-path`); orchestration is the in-session skill's job.
- **Policy (config/template, swappable)**: `default-template/anchored.default.yml`
  + the field declarations the user adds in their `anchored.yml`.
