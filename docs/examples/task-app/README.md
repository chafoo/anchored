# task-app — anchored kata kit

A runnable anchored kata: build a small local-first task app from a product
ticket, with every acceptance criterion backed by real evidence (`bun test`
output for logic, browser observation for DOM/visual criteria).

This kit contains everything needed to spin up the kata in a fresh repository.
It ships **no anchored state** — you generate the run yourself.

---

## What this kit is

The kata exercises the full anchored workflow (plan → refine → build → wrap) on
a realistic product ticket. The deliverable is a single-page, offline task app
built with Bun + TypeScript and a framework-free DOM. The ticket (`Ticket.md`)
specifies the requirements; the anchored config (`anchored.yml`) wires the
git workflow and evidence gates.

Working through the kata produces:

- Real `bun test` output recorded as evidence per logic acceptance criterion.
- A clean git history: an epic integration branch, one feature-task branch per
  task, squash-merged back, then a single `--no-ff` merge onto `main`.
- Concrete practice with the anchored evidence-driven workflow.

---

## Prerequisites

- **Bun** installed (`bun --version`). See [bun.sh](https://bun.sh).
- The **anchored plugin** installed in Claude Code.
- The **anchored CLI** at version **0.5.2 or newer** — the example's `anchored.yml`
  uses the `${NODE_SLUG}` variable in its git workflow, which the build and wrap
  skill inject from 0.5.2 onward. Check: `anchored --version`.

---

## Setup — copy into a fresh repo

1. Create a fresh repository and enter it:

   ```bash
   git init task-app-kata
   cd task-app-kata
   git commit --allow-empty -m "chore: init"
   ```

2. Copy the kit files in:

   ```bash
   # from wherever you cloned anchored-v2:
   cp path/to/docs/examples/task-app/anchored.yml .
   cp path/to/docs/examples/task-app/Ticket.md .
   mkdir -p .claude/rules
   cp path/to/docs/examples/task-app/rules/*.md .claude/rules/
   ```

3. Initialise the project (Bun reads `package.json`; create a minimal one):

   ```bash
   bun init -y
   ```

The repo should now contain: `anchored.yml`, `Ticket.md`, `.claude/rules/`
(four `.md` files), `package.json`. No anchored state yet — that is generated
in the next step.

---

## Running the kata

All operations go through the anchored CLI and the plugin commands. **CLI/Bash
only — never MCP, never hand-edit the anchored task-files** during engine
operation (raw edits bypass the invariant and the atomic-write layer).

### 1. Plan the epic

Open Claude Code in the repo, then run the plan command pointed at the ticket:

```
/a:plan epic Ticket.md
```

anchored reads the ticket and scaffolds an epic with tasks. Review the plan;
adjust task scope if needed via `/a:refine`.

### 2. Refine

```
/a:refine <epic-slug>
```

Walk through any open questions the planner raised and lock in the acceptance
criteria for each task and phase.

### 3. Build

```
/a:build <epic-slug>
```

anchored iterates over the tasks in rolling-wave order. For each task it:

- Checks out a task branch off `epic/${EPIC_SLUG}` (the epic integration branch).
- Runs phases: implement → task-validate → code-validate → commit.
- Squash-merges the finished task branch back into the epic branch.

Evidence (real `bun test` output or browser-observed result) is recorded per
acceptance criterion by the validator agent before the phase can close.

### 4. Wrap

```
/a:wrap <epic-slug>
```

Delivers the epic to `main` as a single `--no-ff` merge, then rolls up a
summary across all tasks.

---

## What to expect

- **Evidence per criterion** — every logic acceptance criterion is backed by the
  actual `bun test` output (pass count, zero failures). DOM and visual criteria
  are backed by browser-observed results. "Should work" is not accepted.
- **Git history** — the finished repo will have: an epic branch
  (`epic/<epic-slug>`), squashed task commits on the epic branch, and a single
  merge commit on `main`.
- **No console errors** — the DOM rule (`rules/dom.md`) and the storage rule
  (`rules/storage.md`) enforce the patterns that keep the app clean.

---

## Kit contents

| File | Purpose |
| --- | --- |
| `anchored.yml` | anchored config — git workflow steps, evidence gates, TDD enforcement |
| `Ticket.md` | Product requirements (user stories + EARS acceptance criteria + design appendices) |
| `rules/bun-typescript.md` | Stack rule: Bun + TypeScript, framework-free DOM |
| `rules/fractal-modules.md` | Architecture rule: fractal modules, factory functions, colocation |
| `rules/storage.md` | Concern rule: localStorage key naming and quota handling |
| `rules/dom.md` | Concern rule: safe DOM construction (no innerHTML on user content) |

No `.claude/anchored/` state is included — the kata run generates it fresh.
