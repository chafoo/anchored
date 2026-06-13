# File Structure — anchored v2

> Authoritative structure spec. The docs (`/docu-plan`) mirror this structure;
> the build lays out the files along this map. Derived from
> `engine-architecture.md` + the decisions in `fractal-redesign-notes.md`.
>
> **Colocation + folder-naming convention** (binding): see
> `.claude/rules/colocation-and-naming.md`. As soon as a module gains
> companion files (spec, `scope/` helpers, types), it moves into its own
> folder and the main file is **named after the folder** (`io/io.ts`,
> `cli/cli.ts`, `parser/parse/parse.ts`) — never a folder-internal
> `index.ts`, never a barrel (`export * from …`). The single permitted
> `index.ts` is the package-root entry (`core/src/index.ts`). A spec always
> sits next to its subject.

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
> (`io/io.ts`); each `*.ts` has its `*.spec.ts` next to it (omitted below for
> brevity). `index.ts` appears exactly once — the package-root entry.

```
core/
├── package.json                 # @chaafoo/anchored · bin: anchored · (tooling choice in the build)
├── tsconfig.json
├── src/
│   ├── index.ts                 # public entry (the ONLY index.ts): createAnchored(deps) → { cli, ops, config }
│   ├── bin.ts                   # #!/usr/bin/env node shebang entry → cli/cli.ts
│   │
│   ├── config/                  # ── anchored.yml as base dependency ──
│   │   ├── bootstrap.ts         # effectiveConfig = merge(anchored.default.yml, user anchored.yml); once at startup
│   │   ├── merge.ts             # combine default base + user deltas
│   │   └── init.ts              # lazy-init of a user project (anchored.yml + settings)
│   │
│   ├── engine/                  # ── step-resolution config logic (the engine-run chain was removed) ──
│   │   └── scope/
│   │       └── resolve-steps/resolve-steps.ts  # insert the default template's steps + normalize order
│   │                                           # (the ONLY surviving "engine" piece — pure config, no spawn)
│   │
│   ├── ops/                     # ── tier-generic op core ──
│   │   ├── node-ops/node-ops.ts        # createNodeOps(tierSchema, deps): create/read/set-status/add-child/next-child/…
│   │   ├── engine-ops.ts               # ops surface the CLI/stages drive (createEngineOps adapter removed with the headless path)
│   │   ├── facade/facade.ts            # the combined ops facade handed to the CLI
│   │   ├── steps-planner/steps-planner.ts  # resolve the concrete step sequence + worker per step for a stage
│   │   ├── tier-derive.ts              # derive tier/slug relationships
│   │   ├── validate/validate.ts        # node validation surface
│   │   └── scope/
│   │       ├── children/children.ts    # add/move/next-child (dependency graph: first pending whose depends_on are all done)
│   │       ├── questions/questions.ts  # add/resolve question
│   │       ├── worker-dispatch/worker-dispatch.ts  # DEFAULT_WORKERS roster: which agent a use: step maps to (a plan hint for the skill)
│   │       └── log.ts                  # append-only log
│   │
│   ├── schema/                  # ── Zod schemas ──
│   │   ├── step/step.ts                # step grammar: name + (run XOR use+type) + instructions; involve on walk
│   │   ├── config/config.ts            # anchored.yml schema (tiers, _lib aliases allowed)
│   │   ├── custom-fields/custom-fields.ts  # extend a tier schema with user-declared fields
│   │   └── tiers/                       # tier schema descriptors (fields = config-driven, mechanics = here)
│   │       ├── phase.ts                 # Leaf: ac/status/context/rules/evidence/failures
│   │       ├── task.ts                  # status/context.{plan,refine,build,wrap}/questions/log/phases
│   │       ├── epic.ts                  # status/goal/acceptance/questions/tasks(stubs)/log
│   │       └── project.ts               # reserved, same form
│   │
│   ├── state/                   # ── state machine + invariants (substrate mechanics) ──
│   │   ├── transitions/transitions.ts  # per-tier transitions + assertTransition (forward-only)
│   │   └── invariants/invariants.ts    # HARD invariant: no ac→done without evidence
│   │
│   ├── parser/                  # ── YAML <-> Node ──
│   │   ├── parse/parse.ts       # parseNodeYAML (two profiles: task-file no-alias, anchored.yml alias-ok)
│   │   └── render/render.ts     # renderNodeYAML: schema directive + block-scalar for prose
│   │
│   ├── io/io.ts                 # atomic-write: lock + mkdir -p + POSIX-rename
│   │
│   │                            # (spawn/ REMOVED — the headless `claude -p` seam is gone; the
│   │                            #  in-session skill spawns workers via the Task / Workflow tools)
│   │
│   ├── cli/                     # ── `anchored` CLI (the only transport, no MCP) ──
│   │   ├── cli.ts               # entry + dispatch; JSON output (folder-named, not index.ts)
│   │   ├── stage.spec.ts        # spec for the stage verbs on the cli surface (beside cli.ts)
│   │   └── commands/
│   │       ├── plan/plan.ts     # `anchored plan <tier?> <input>`  (classify when tier is missing)
│   │       ├── refine.ts        # `anchored refine <slug>`
│   │       ├── build.ts         # `anchored build <slug>`
│   │       ├── wrap.ts          # `anchored wrap <slug>`
│   │       ├── archive.ts       # archive a completed node
│   │       ├── reset.ts         # reset a node/stage
│   │       ├── steps.ts         # inspect the resolved step sequence
│   │       ├── node/node.ts     # generic node verbs (read/set-status/add-evidence/log …) for agents
│   │       └── scope/lifecycle.ts  # shared stage-lifecycle helper for the stage commands
│   │
│   └── e2e/                     # ── cross-cutting suites (no single subject) ──
│       ├── e2e.dogfood.spec.ts          # drive a real task-file lifecycle end-to-end
│       ├── lifecycle-e2e.spec.ts        # full lifecycle of both tiers through the real CLI argv path
│       ├── archive-reset.e2e.spec.ts    # archive/reset through the real CLI argv path (cross-cutting)
│       ├── extensibility-matrix.spec.ts # extend anchored without touching substrate code
│       ├── epic-tier.e2e.spec.ts        # epic-tier scaffold/walk/loop/roll-up
│       └── skeleton.spec.ts             # package skeleton / wiring smoke
│
└── default-template/
    └── anchored.default.yml     # the shipped default config (reference, not copied into the user project)
```

> Specs colocate with their subject (`io/io.ts` + `io/io.spec.ts`). The
> **only** specs not next to a single subject are the cross-cutting suites in
> `e2e/`; `index.spec.ts` stays beside `index.ts` as the package-entry
> companion.

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

- **Mechanism (code/substrate, fixed)**: `ops/`, `state/`, `parser/`,
  `io/io.ts`, `engine/scope/resolve-steps/` (step resolution — the only surviving
  engine piece), the tier mechanics in `schema/tiers/*` (status enum, transitions,
  child relationship), the invariant. The engine-run chain + the `spawn` seam were
  removed (`remove-headless-engine-path`); orchestration is the in-session skill's
  job.
- **Policy (config/template, swappable)**: `default-template/anchored.default.yml`
  + the field declarations the user adds in their `anchored.yml`.
