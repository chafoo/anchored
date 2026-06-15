# anchored v3 — add-ons (post-merge work on top of the requirements-3 base)

> The requirements-3 base (core + plugin) is merged to `main`. This document records the
> next batch of work — the **v3 add-ons** — decided 2026-06-15. Each add-on has a goal, a
> design, the decisions, and the build impact. Build them on the `v3-add-ons` branch.

## The driving goal (why these add-ons)

Two things: **(a) a structured, legible on-disk home** for anchored's nodes, and **(b)
history-aware planning** — when we plan new work, anchored should first read the *past* of
the endeavour (earlier decisions, prior tasks, what was tried) the way a developer would
catch up on a codebase before changing it. The archive is not a graveyard; it is the
**project memory** that planning mines for context.

---

## Add-on 1 — structured storage layout (`.claude/anchored/`)

### Goal
Replace the flat `.claude/tasks/<slug>.yml` with a folder-structured `.claude/anchored/`
where **the open work and the finished work are physically separated**, so a glance at
`.claude/anchored/` shows only what is still in flight.

### The layout
```
.claude/anchored/
  <epic-name>/          ← one folder per OPEN epic
    _epic.yml           ← the epic node
    login.yml           ← its task files
    logout.yml
  tasks/                ← OPEN standalone tasks (not in any epic)
    fix-bug.yml
  _archive/
    <epic-name>/        ← a finished epic — the whole folder moved here
    tasks/              ← finished standalone tasks
```

### Path mapping (what `pathFor` produces)
| Node | Slug | Path |
|---|---|---|
| Epic | `my-epic` | `anchored/my-epic/_epic.yml` |
| Task in an epic | `my-epic/login` | `anchored/my-epic/login.yml` |
| Standalone task | `fix-bug` | `anchored/tasks/fix-bug.yml` |
| Phase | `my-epic/login/setup` | *(no own file — embedded in the task file)* |

### Design — tier-aware `pathFor`
Today `pathFor(slug)` is **tier-agnostic** (slug only). A *bare* slug is ambiguous — epic
(`<slug>/_epic.yml`) vs. standalone task (`tasks/<slug>.yml`); only the tier resolves it,
and only the CLI knows the tier. Resolution **without breaking the dumb-store contract**:
at assembly (`cli.ts`), each tier module is injected a store whose `pathFor` is **bound to
that tier** — `createEpic({ store: storeFor('epic') })`, `createTask({ store:
storeFor('task') })`, and **phase reads task files** → `storeFor('task')`. The base
`pathFor(slug, tier)` lives in the bin/cli seam (layout = policy); the store stays dumb.
Slug structure still disambiguates *tasks* (a `/` means "inside an epic"); the tier
disambiguates bare epic vs. bare standalone task.

### Decisions
- **Epic node file:** `_epic.yml` inside the epic folder.
- **Archive trigger:** the **last step of `wrap`** always moves the node to `_archive`
  (explicit — the wrap skill calls `anchored <tier> archive <slug>` once the node is
  `done`). Decoupled from the `status` verb (no `_archive` read-fallback needed):
  - epic done → move the **whole epic folder** `anchored/<epic>/` → `anchored/_archive/<epic>/`.
  - standalone task done → move the **file** `anchored/tasks/<t>.yml` → `anchored/_archive/tasks/<t>.yml`.
  - a task **inside** an epic that reaches done → **stays** in the epic folder (it moves
    later, with the epic).
- **No migration.** New nodes use the new layout; pre-existing `.claude/tasks/*` are left
  as-is (go-forward only).

### Build impact (core seam — no schema/verb change)
- `bin.ts` / `cli.ts`: the `pathFor(slug, tier)` layout function + per-tier store binding.
- `services/store/store.ts`: `archivePathFor` becomes **injected** (layout = policy, not
  derived in the dumb store); `archive` moves a **folder** for an epic, a **file** for a
  standalone task.
- Test harnesses (`cli.e2e` · `cli.int` · `lifecycle.e2e` · `store.spec`) inject the new
  `pathFor`/archive and assert the new paths.
- `lib/contracts/store.ts`: `pathFor`/`archivePathFor` signature note.

---

## Add-on 2 — history-aware plan-explore (mine `_archive` for context)

### Goal
When planning new work, **read the project's past first.** A developer catching up reads
what was already built and *why* before touching anything; anchored's plan stage should do
the same — scan `_archive/` for finished epics/tasks whose decisions, acceptance criteria,
or wrap summaries bear on the new work, and feed that into the plan as grounding.

### Design
- The **plan explore** step (`plan-discover` agent, and/or the built-in Explore) gains a
  second source besides the live codebase: **`.claude/anchored/_archive/`**.
- It scans archived nodes for relevance to the new task (keyword/topic match on titles,
  goals, acceptance-criteria text, wrap summaries, decision-trail `log[]` entries) and
  surfaces the relevant history as discovery context: *"this was already attempted in
  `<archived-epic>`; the decision was X because Y; the wrap noted Z."*
- This grounds the new plan in prior decisions — avoids re-litigating settled forks and
  re-treading abandoned paths.

### Decisions / open questions (resolve at build time)
- **Reach:** scan archived **wrap summaries + decision logs + acceptance criteria** (the
  high-signal parts), not every line of every archived file.
- **Where it lands:** the discovery writes the relevant history into the plan trail
  (`append-log … plan learning "<prior decision / where it lives>"`) so the decompose
  agent and the user both see it.
- Depends on Add-on 1 (the `_archive` layout) being in place first.

### Build impact (plugin)
- `plan-discover.md`: add the `_archive` scan as a discovery source.
- `skills/plan/SKILL.md`: note that explore now also reads the project history.

---

## Add-on 3 — remove the `project` tier (YAGNI)

### Goal
The `project` tier was carried through the rebuild but **never properly defined**, and it
is not needed to test the epic flow. **Remove it entirely — code and skill — now.** Epic is
the top tier. Project can be re-introduced later as its own deliberate design, if ever.

### Decisions
- **YAGNI — rip it out completely**, both core and plugin. Epic ▸ task ▸ phase only.

### Build impact
**Core (remove):**
- `modules/project/` (project.ts, project.schemas.ts, + specs).
- the `project` tier in `services/template/config.schemas.ts` (`tierNames`), the default
  template `project:` block, and the `cli.ts` assembly wiring for project.
- any `project` reference in `lib/`/`modules/shared` (e.g. lifecycle is shared, stays —
  only project-specific bits go).
- spec-coverage stays green (removing files removes their coverage requirement).

**Plugin (remove):**
- `agents/project-scaffold.md`, `agents/project-roll-up.md`.
- `project` mentions/steps in `references/anchored.default.yml`, `references/agent-contract.md`,
  the skills (plan/refine/build/wrap), `references/config.md`, the example configs.
- the smoke (`scripts/smoke.sh`) + contract-eval cover only epic/task/phase after.

**Docs:** drop `project` from `api.md`, `architecture.md`, `requirements*.md` where it is
load-bearing (or mark it "deferred — see add-ons").

---

## Build order

1. **Add-on 3 (project removal)** first — smallest surface, clears the deck so the storage
   work isn't done twice (project would have needed its own folder rule otherwise).
2. **Add-on 1 (storage layout)** — the `pathFor`/archive seam + per-tier store binding +
   wrap-archives-on-done.
3. **Add-on 2 (history-aware explore)** — depends on Add-on 1's `_archive` being real.

Each on `v3-add-ons`, green-gated per the usual gates (core: lint/format/typecheck/test/
coverage/build; plugin: guard-prose/contract-eval/smoke).

---

## Status — all three DONE (2026-06-15, branch v3-add-ons)

- **Add-on 3 (project removal)** — `ab8298a`. `anchored project` → UnknownTier; epic is the top tier. Core + plugin + docs + tooling.
- **Add-on 1 (storage layout)** — core seam `6d1c19b` + wrap-archive step `8d3f2e1`. `.claude/anchored/` with epic folders · tasks/ · _archive/; tier-aware pathFor via per-tier store binding; wrap archives the finished node (epic → folder, standalone task → file; in-epic task moves with the epic). Verified through the real binary.
- **Add-on 2 (history-aware explore)** — `9ec7bfa`. plan-discover mines `_archive/` (wrap summaries, decision trails, ACs) so planning reads the project's past.

Full gate green: core lint/format/typecheck/build/test (87 unit / 5 e2e / 5 int / coverage); plugin guard-prose / contract-eval / smoke.
