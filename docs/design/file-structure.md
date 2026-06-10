# File-Struktur — anchored v2

> Autoritative Struktur-Spec. Die Doku (`/docu-plan`) spiegelt diese Struktur;
> der Build legt die Dateien entlang dieser Karte an. Abgeleitet aus
> `engine-architecture.md` + den Entscheidungen in `fractal-redesign-notes.md`.

## Top-Level

```
anchored-v2/
├── core/                  # das CLI-/Engine-Paket (TypeScript, npm)
├── plugin/                # das Claude-Code-Plugin (Namespace `a`)
├── docs/                  # Doku (macro/medio/micro) — von /docu-plan gebaut
│   └── design/            # diese Design-Spec (Quelle der Wahrheit fürs Modell)
├── README.md
└── .gitignore
```

## core/ — Engine + Substrat + CLI

```
core/
├── package.json                 # @chaafoo/anchored · bin: anchored · (Tooling-Wahl im Build)
├── tsconfig.json
├── src/
│   ├── index.ts                 # öffentlicher Einstieg: wiring createEngine + createOps
│   │
│   ├── config/                  # ── anchored.yml als Base-Dependency ──
│   │   ├── bootstrap.ts         # effectiveConfig = merge(anchored.default.yml, user anchored.yml); einmal beim Start
│   │   └── merge.ts             # Default-Basis + User-Deltas zusammenführen
│   │
│   ├── engine/                  # ── die fraktale Factory-Engine ──
│   │   ├── engine.ts            # createEngine(deps) → run(tier, node)
│   │   ├── tier-runner.ts       # createTierRunner(cfg, deps) → fährt plan/refine/build/wrap eines Knotens
│   │   ├── stage-runner.ts      # createStageRunner(cfg, deps) → fährt die steps einer Stage in Reihenfolge
│   │   ├── step-runner.ts       # createStepRunner(cfg, deps) → ein Step: run | use | each
│   │   └── scope/
│   │       ├── run-step.ts      # run:  → Bash
│   │       ├── worker-step.ts   # use:  → spawn(agent | claude -p)
│   │       ├── loop-step.ts     # each: → pro Kind den Body (interleaved), dann advance + stop; ruft tier-runner
│   │       └── resolve-steps.ts # Built-in-Defaults aus dem Default-Template einsetzen + Reihenfolge normalisieren
│   │
│   ├── ops/                     # ── tier-generischer Op-Kern ──
│   │   ├── node-ops.ts          # createNodeOps(tierSchema, deps): create/read/set-status/add-child/next-child/…
│   │   └── scope/
│   │       ├── children.ts      # add/move/next-child (DAG: erster pending dessen depends_on alle done)
│   │       ├── questions.ts     # add/resolve question
│   │       └── log.ts           # append-only log
│   │
│   ├── schema/                  # ── Zod-Schemas ──
│   │   ├── step.ts              # Step-Grammatik: name + (run XOR use+type) + instructions; involve auf walk
│   │   ├── config.ts            # anchored.yml-Schema (Tiers, _lib-Aliasse erlaubt)
│   │   └── tiers/               # Tier-Schema-Deskriptoren (Felder = Config-getrieben, Mechanik = hier)
│   │       ├── phase.ts         # Leaf: ac/status/context/rules/evidence/failures
│   │       ├── task.ts          # status/context.{plan,refine,build,wrap}/questions/log/phases
│   │       ├── epic.ts          # status/goal/acceptance/questions/tasks(stubs)/log
│   │       └── project.ts       # reserviert, gleiche Form
│   │
│   ├── state/                   # ── State-Machine + Invarianten (Substrat-Mechanik) ──
│   │   ├── transitions.ts       # per-Tier-Transitions + assertTransition (forward-only)
│   │   └── invariants.ts        # HARTE Invariante: kein ac→done ohne evidence
│   │
│   ├── parser/                  # ── YAML <-> Node ──
│   │   ├── parse.ts             # parseNodeYAML (zwei Profile: task-file no-alias, anchored.yml alias-ok)
│   │   └── render.ts            # renderNodeYAML: Schema-Directive + block-scalar für Prosa
│   │
│   ├── io.ts                    # atomic-write: lock + mkdir -p + POSIX-rename (Einzel-File → kein Ordner)
│   │
│   ├── spawn.ts                 # Ausführungs-Substrat: `claude -p` pro Task-File; Phasen in-process (Einzel-File → kein Ordner; subagent-Modus später)
│   │
│   └── cli/                     # ── `anchored` CLI (einziger Transport, kein MCP) ──
│       ├── index.ts             # Entry + Dispatch; JSON-Output
│       └── commands/
│           ├── plan.ts          # `anchored plan <tier?> <input>`  (classify wenn Tier fehlt)
│           ├── refine.ts        # `anchored refine <slug>`
│           ├── build.ts         # `anchored build <slug>`
│           ├── wrap.ts          # `anchored wrap <slug>`
│           └── node.ts          # generische Node-Verben (read/set-status/add-evidence/log …) für Agents
│
└── default-template/
    └── anchored.default.yml     # die mitgelieferte Default-Config (Referenz, nicht ins User-Projekt kopiert)
```

## plugin/ — Claude-Code-Plugin (Namespace `a`)

```
plugin/
├── .claude-plugin/
│   └── plugin.json              # name: "a" (Fallback "anc") · Brand/Display siehe Scaffold-Check
├── skills/                      # Slash-Commands = Skills → /a:plan /a:refine /a:build /a:wrap
│   ├── plan/SKILL.md            # /a:plan <tier?> <input>  · ruft `anchored plan …` via Bash
│   ├── refine/SKILL.md
│   ├── build/SKILL.md
│   └── wrap/SKILL.md
└── agents/                      # flach, Stage-Präfix-Buckets (keine Unterordner — CC scannt nur flach)
    ├── plan-discover.md         # geteilt (tier-parametrisiert)
    ├── plan-decompose.md        # task: → Phasen
    ├── plan-classify.md         # epic|task|phase Empfehlung
    ├── refine-plan-check.md     # geteilt
    ├── refine-rules-check.md    # geteilt
    ├── build-implement.md       # Leaf
    ├── build-task-validate.md   # Leaf
    ├── build-code-validate.md   # Leaf
    ├── wrap-review.md           # geteilt
    ├── wrap-summarize.md        # geteilt
    ├── epic-scaffold.md         # epic: → Stubs
    └── epic-roll-up.md          # epic: DoD + Retro
```

> Reserviert/Tabu: Agents **nie** `plan`/`explore` nennen (CC-reservierte
> Agent-Typen). `walk` ist Skill-Routing-Logik, kein Agent.

## Mechanismus vs. Policy (wo was lebt)

- **Mechanismus (Code/Substrat, fix)**: `engine/`, `ops/`, `state/`, `parser/`,
  `io/`, die Tier-Mechanik in `schema/tiers/*` (Status-Enum, Transitions,
  Kind-Beziehung), die Invariante.
- **Policy (Config/Template, austauschbar)**: `default-template/anchored.default.yml`
  + die Felder-Deklarationen, die der User in seiner `anchored.yml` ergänzt.
