# File Structure — anchored v2

> Authoritative structure spec. The docs (`/docu-plan`) mirror this structure;
> the build lays out the files along this map. Derived from
> `engine-architecture.md` + the decisions in `fractal-redesign-notes.md`.

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

```
core/
├── package.json                 # @chaafoo/anchored · bin: anchored · (tooling choice in the build)
├── tsconfig.json
├── src/
│   ├── index.ts                 # public entry: wiring createEngine + createOps
│   │
│   ├── config/                  # ── anchored.yml as base dependency ──
│   │   ├── bootstrap.ts         # effectiveConfig = merge(anchored.default.yml, user anchored.yml); once at startup
│   │   └── merge.ts             # combine default base + user deltas
│   │
│   ├── engine/                  # ── the fractal factory engine ──
│   │   ├── engine.ts            # createEngine(deps) → run(tier, node)
│   │   ├── tier-runner.ts       # createTierRunner(cfg, deps) → runs plan/refine/build/wrap of a node
│   │   ├── stage-runner.ts      # createStageRunner(cfg, deps) → runs the steps of a stage in order
│   │   ├── step-runner.ts       # createStepRunner(cfg, deps) → one step: run | use | each
│   │   └── scope/
│   │       ├── run-step.ts      # run:  → Bash
│   │       ├── worker-step.ts   # use:  → spawn(agent | claude -p)
│   │       ├── loop-step.ts     # each: → the body per child (interleaved), then advance + stop; calls tier-runner
│   │       └── resolve-steps.ts # insert built-in defaults from the default template + normalize order
│   │
│   ├── ops/                     # ── tier-generic op core ──
│   │   ├── node-ops.ts          # createNodeOps(tierSchema, deps): create/read/set-status/add-child/next-child/…
│   │   └── scope/
│   │       ├── children.ts      # add/move/next-child (dependency graph: first pending whose depends_on are all done)
│   │       ├── questions.ts     # add/resolve question
│   │       └── log.ts           # append-only log
│   │
│   ├── schema/                  # ── Zod schemas ──
│   │   ├── step.ts              # step grammar: name + (run XOR use+type) + instructions; involve on walk
│   │   ├── config.ts            # anchored.yml schema (tiers, _lib aliases allowed)
│   │   └── tiers/               # tier schema descriptors (fields = config-driven, mechanics = here)
│   │       ├── phase.ts         # Leaf: ac/status/context/rules/evidence/failures
│   │       ├── task.ts          # status/context.{plan,refine,build,wrap}/questions/log/phases
│   │       ├── epic.ts          # status/goal/acceptance/questions/tasks(stubs)/log
│   │       └── project.ts       # reserved, same form
│   │
│   ├── state/                   # ── state machine + invariants (substrate mechanics) ──
│   │   ├── transitions.ts       # per-tier transitions + assertTransition (forward-only)
│   │   └── invariants.ts        # HARD invariant: no ac→done without evidence
│   │
│   ├── parser/                  # ── YAML <-> Node ──
│   │   ├── parse.ts             # parseNodeYAML (two profiles: task-file no-alias, anchored.yml alias-ok)
│   │   └── render.ts            # renderNodeYAML: schema directive + block-scalar for prose
│   │
│   ├── io.ts                    # atomic-write: lock + mkdir -p + POSIX-rename (single file → no folder)
│   │
│   ├── spawn.ts                 # execution substrate: `claude -p` per task-file; phases in-process (single file → no folder; subagent mode later)
│   │
│   └── cli/                     # ── `anchored` CLI (the only transport, no MCP) ──
│       ├── index.ts             # entry + dispatch; JSON output
│       └── commands/
│           ├── plan.ts          # `anchored plan <tier?> <input>`  (classify when tier is missing)
│           ├── refine.ts        # `anchored refine <slug>`
│           ├── build.ts         # `anchored build <slug>`
│           ├── wrap.ts          # `anchored wrap <slug>`
│           └── node.ts          # generic node verbs (read/set-status/add-evidence/log …) for agents
│
└── default-template/
    └── anchored.default.yml     # the shipped default config (reference, not copied into the user project)
```

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

- **Mechanism (code/substrate, fixed)**: `engine/`, `ops/`, `state/`, `parser/`,
  `io/`, the tier mechanics in `schema/tiers/*` (status enum, transitions,
  child relationship), the invariant.
- **Policy (config/template, swappable)**: `default-template/anchored.default.yml`
  + the field declarations the user adds in their `anchored.yml`.
