# RFC: tier-resource CLI + tier-centric code layout

> Status: **draft for review**. Supersedes the flat `node <verb> <slug>` surface
> (`cli/commands/node/node.ts`) and the slug-facade indirection
> (`store/node-router`). Substrate (codec, io, node-store, invariants, transitions)
> is sound and stays — this is a re-cut of the OUTER shell only, plus a layout move.

## 1. Why

The substrate is already tier-structured: `opsFor(tier) → TierOps` produces one
tier-bound op-set per tier (see `index.ts` `buildSubstrate`). But the CLI surface
flattens that back into a single tier-blind bucket (`node <verb> <slug>`, ~30 verbs
in one switch), and the facade has to *guess the tier back* from file shape
(`makeTierFor`). The surface fights the substrate.

The goal: a **resource-oriented CLI** (`anchored <tier> <verb> <args>`) where every
tier carries the *same* verb form, and a **tier-centric code layout** that mirrors
it one-to-one. This is more fractal, not less: the same form instantiated per tier,
instead of one bucket pretending every node is the same.

Principle: **everything an agent or the main session can change about a file is a
verb on a tier — and we cover all of it.** Completeness is a checkable criterion,
not a feeling.

## 2. The CLI surface

Grammar: `anchored <tier> <verb> <slug> [args]` (noun-first, like `gh pr create`).
Stage commands keep their own top-level (`plan`/`refine`/`build`/`wrap`/`steps`/
`validate`) — they are tier-crossing orchestration, not node mutations.

### 2.1 Universal verbs — every addressable node (project · epic · task · phase)

| Verb | Args | Maps to |
| --- | --- | --- |
| `get` | `<slug>` | read |
| `set` | `<slug> <field> <value>` | setField (reserved-field guard) |
| `status` | `<slug> <to>` | setStatus (forward-only transition) |
| `log` | `<slug> <at> <kind> <note>` | appendLog |
| `add-question` | `<slug> <text> [priority]` | addQuestion |
| `list-questions` | `<slug> [status]` | read + filter |
| `resolve-question` | `<slug> <id> <answer> [source] [reasoning]` | resolveQuestion |
| `add-concern` | `<slug> <text> [priority]` | addConcern |
| `list-concerns` | `<slug> [status]` | read + filter |
| `resolve-concern` | `<slug> <id> <answer> [source] [reasoning]` | resolveConcern |

### 2.2 Parent tiers — project (→epics), epic (→tasks)

Children are stubs in the parent file until they become their own file (lazy, on
`task plan`). While a stub: addressed through the parent.

| Verb | Args | Maps to |
| --- | --- | --- |
| `add-child` | `<slug> <child> [goal] [deps-csv]` | addChild |
| `child-status` | `<slug> <child> <status>` | setChildStatus |
| `child-set` | `<slug> <child> <field> <value>` | setChildField |
| `next-child` | `<slug>` | nextChild |
| `ready-children` | `<slug>` | readyChildren |
| `add-acceptance` | `<slug> <text>` | addAcceptance (node's OWN DoD) |
| `acceptance-status` | `<slug> <id> <status> [evidence]` | setAcceptanceStatus |

### 2.3 task (→phases)

| Verb | Args | Maps to |
| --- | --- | --- |
| `add-phase` | `<slug> <phase> [name]` | addPhase |
| `list-phases` | `<slug>` | read + extract |

### 2.4 phase (leaf) — see §4 for addressing

A phase has its OWN data (`acceptance_criteria`, `evidence`, `rules`, `executor`,
`context`, `status`). Today these are modelled as *child-ops on the task*
(`add-phase-evidence`, `set-ac-status`, `set-phase-rules`, …). In the tier-centric
model they become **phase verbs**, because the code should mirror the API.

| Verb | Args | Maps to (today) |
| --- | --- | --- |
| `status` | `<addr> <to>` | setChildStatus |
| `set` | `<addr> <field> <value>` | setExecutor / setField (context) |
| `set-rules` | `<addr> <path> <why>` | setPhaseRules |
| `add-ac` | `<addr> <text>` | addAc |
| `ac-status` | `<addr> <ac> <status>` | setChildAcStatus |
| `add-evidence` | `<addr> <ac> <text>` | addChildEvidence |
| `add-evidence --run` | `<addr> <ac> --run "<cmd>"` | verified-run floor (exit 0 only) |
| `set-failures` | `<addr> <ac> <text>` | setChildFailures |
| `clear-failures` | `<addr> <ac>` | clearChildFailures |

Note: epic task-stubs *also* carry `acceptance_criteria` (D2) — so `add-ac` /
`ac-status` / `add-evidence` / `set-failures` apply to an epic child too, addressed
as `epic <verb> <child>` while the child is a stub. See §4.

## 3. Code layout — tier-centric, mirroring the surface

`modules/` holds the domain units, split into **stages** (the lifecycle
orchestration, tier-crossing) and the **per-tier** modules (the resource verbs).
`services/` holds the substrate that serves them. Colocation holds inside every
folder (schema + ops + cli-verbs + spec together).

```
core/src/
  modules/
    stages/                # plan · refine · build · wrap — the engine stages
      plan/  refine/  build/  wrap/  steps/  classify/
    epic/                  # one folder per tier — everything epic, colocated
      epic.schema.ts       #   schema + descriptor + status enum
      epic.ops.ts          #   tier-bound read-modify-write ops
      epic.cli.ts          #   the resource verbs (get/set/status/add-child/…)
      epic.spec.ts
    task/   …
    phase/  …
    project/ …
  services/                # serve the tier modules, no tier knowledge
    store/                 # node-store (read-modify-write through io)
    codec/                 # parse + render (yaml ⇆ node)
    io/                    # fs seam
    config/                # merge + bootstrap (default ⊕ user, once)
    invariants/            # the hard invariant (ac→done needs evidence)
    transitions/           # the forward-only state machine
  cli/cli.ts               # dispatch: <tier> in cfg.tiers → modules/<tier>/cli
  index.ts                 # createAnchored wiring (already the factory you want)
  bin.ts                   # the only fs/runtime touch
```

What dissolves:
- `cli/commands/node/node.ts` (the flat bucket) → split across `modules/*/cli.ts`.
- `store/node-router` (the slug-facade) → the per-tier `cli.ts` calls `opsFor(tier)`
  directly; the tier is explicit in the command, so `makeTierFor`-as-guess is gone
  (kept only as a *validation guard*: "epic verb on a task file" → loud error).

## 4. Open decision — phase / child addressing (the one real fork)

A phase is **never its own file** — it always lives in `task.phases[]`. So "phase as
an addressable tier" means the phase verbs load the *task* file and mutate the phase
element inside it. The address is a handle; the physics route to the parent.

Two address forms:
- **(A) compound slug** — `anchored phase status my-task/setup-db done`
- **(B) two args** — `anchored phase status my-task setup-db done`

**Recommendation: (A) compound slug.** It keeps every verb's positional shape
identical across tiers (`<tier> <verb> <slug> …`), nests naturally with the existing
`<epic>/<task>` slug convention (`NestedSlug`), and reads as one address. The router
splits on the last `/` to find (parent-file, child-element).

Symmetric question for epic children: a task-stub starts as `epic.tasks[]` data and
*becomes* its own file on `task plan` (rolling-wave, lazy). So `add-ac` on a child
runs against the **epic** file while it's a stub, and against the **task** file once
the file exists. Proposal: the router resolves the address to "deepest existing
file + remainder as element path" — `my-epic/my-task` hits the task file if it
exists, else the epic's stub. One rule, both cases.

This is the only part that needs a decision before code moves. Everything else is
mechanical.

## 5. What must move in lockstep

A layout/surface change is **code + rules + design-docs in one epic**, or the
machine flags its own new structure:
- `.claude/rules/colocation-and-naming.md` — folder-per-tier is consistent with it;
  confirm the `modules/`+`services/` split is spelled out.
- `.claude/rules/factory-functions.md` — unchanged in spirit (`createX(cfg,deps)`),
  examples repointed to new paths.
- `docs/design/file-structure.md` — the authoritative map; rewrite to this tree.
- `docs/design/engine-architecture.md` — repoint layer names.
- Plugin skills/agents that shell out `anchored node <verb>` → `anchored <tier>
  <verb>` (every `plugin/**/*.md` call site). Decide: hard cut, or keep `node` as a
  deprecated alias for one cycle.

## 6. Migration shape (as an anchored epic — dogfood)

1. **inventory + freeze the verb table** (this doc, §2) — the completeness contract.
2. **per-tier modules** — move schema/ops, add `*.cli.ts`, one tier at a time.
3. **router** — `cli.ts` dispatch on `<tier>`; address resolution (§4); drop
   node-router.
4. **services rename** — `domain/` + `store/` + `config/` → `services/*`,
   `orchestration/` → `modules/stages/`.
5. **rules + docs** — rewrite `file-structure.md`, the rules, the skill call sites.
6. **alias window** (optional) — `node <verb>` → tier dispatch shim, warn-on-use.

Steps 2–4 are the substance; 1 gates them; 5 keeps the machine honest; 6 is the
backward-compat cushion.
