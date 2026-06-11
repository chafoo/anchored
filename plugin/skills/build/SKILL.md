---
name: build
description: Execute the build stage of an anchored node — iterate its children to completion with the failures-driven re-do loop. Triggers ONLY on the explicit `/a:build <slug>` command. Runs the fractal build via the `anchored` CLI. Use for `/a:build`, not for general "build the app" requests.
---

# /a:build — fractal build stage

Explicit-only: the user typed `/a:build <slug>`.

## Pre-flight

- Load `anchored.yml`. Resolve the `<slug>` to a node; the **tier is derived from
  the node** (the only argument is the slug).
- State gate: build expects a `refined` node (the CLI warns + asks once if you skip
  refine).

## Run (CLI-only, via Bash)

```bash
anchored build <slug>
```

## Fractal build semantics

The CLI runs the build deterministically — this is what happens behind it:

- **Leaf (`phase`)**: `build` has no `each`, so it runs once — `implement`, then the
  `task-validate` + `code-validate` gates.
- **Looping tiers (`task.build.each: phase`, `epic.build.each: task`)**: the loop
  runs each child's body **interleaved** (child A fully, then child B), recursing
  into the child tier. The DAG (`next-child`) picks the next runnable child.
- **`stop` + `retry_limit`** are properties of a looping `build`: a failing child is
  re-run up to `retry_limit` (default 3); a `stop`-condition match halts the loop and
  escalates. These hold on every looping tier.

The CLI emits a JSON envelope; relay per-child status + evidence. No MCP, no raw
node-file edit.

## Workflow mode (fan-out) — allowlist precondition

When a looping `build` runs in **workflow mode** (`build.mode: workflow`, opt-in;
phases marked `executor: workflow` via `anchored node set-executor <slug> <phase>
workflow`), the loop fans the children out as a **background** Claude-Code workflow
(≤16 parallel) instead of running them interleaved. Each unit does its work and
self-writes its evidence/failures via the `anchored` CLI; the loop then collects
that state back from the task-file (evidence-driven, resume-safe) and runs the
wrap-gates **once** over the merged result.

**Hard precondition: `Bash(anchored *)` must be pre-approved on the allowlist.**
A background workflow has no interactive session, so an un-allowlisted `anchored`
call **hangs on the permission prompt** — the units can never self-write and the
collect stalls. Before starting a workflow-mode build, ensure the project's
settings allowlist `Bash(anchored *)` (the lazy-init in `/a:plan` seeds this). If
it is missing, surface it as a known failure condition and do not dispatch.
