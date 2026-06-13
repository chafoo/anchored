← [orchestration](../_orchestration.md)

# steps-planner

`createStepsPlanner(config)` turns the resolved, config-driven steps for one
tier/stage into a `StepPlan` the in-session skills execute. Per step it decides:
is this a **worker** (→ which plugin agent to spawn), a **bash run**, or the
**loop edge** (→ child tier + stop/retry)? Pure + deterministic.

## What

- `createStepsPlanner(config)` returns one method: `plan(tier, stage) → StepPlan`.
- It composes two deps internally: `createResolveSteps(config)` (the
  each-shorthand expansion + canonical order) and `createWorkerDispatch()` (the
  step-name → agent mapping).
- `plan(tier, stage)` reads the tier's `build` block (`stop`, `retry_limit`) from
  config, resolves the ordered `Step[]` for that tier/stage, and maps each to a
  `PlanStep`. Result shape: `{ tier, stage, steps }`.
- **Classification per step** (`toPlanStep`):
  - `s.each` set → `kind: 'loop'` — the fractal recursion into the child tier;
    carries `each`, the tier-`build.stop` (only if present), and `retry_limit`
    (defaults to `3` when the build block omits it).
  - `s.run` set, or the bare built-in named `run` → `kind: 'run'`; carries `run`
    (the bash command, when present) and `instructions`.
  - otherwise → `kind: 'worker'`; the name (`s.use ?? s.name`) is resolved via
    `dispatch.resolveWorker`; the resolved `ref.ref` lands as `agent`, and
    `instructions` flows through.
- **`instructions` flows through every kind** — run/use/worker alike — so the
  skill can follow a step's prose guidance when executing it.
- An unrecognised `use`/name still produces a `worker`-kind step (just without an
  `agent` ref) — a custom subagent the orchestrator can still dispatch.

## How

Usage: `createStepsPlanner(effectiveConfig).plan('phase', 'build')`.

```mermaid
flowchart TB
    call["plan(tier, stage)"] --> bc["read config[tier].build → stop, retry_limit"]
    call --> res["resolver.resolve(tier, stage) → Step[]"]
    res --> map["map each Step → toPlanStep"]
    map --> d1{"s.each set?"}
    d1 -- yes --> loop["kind: loop · each + stop? + retry_limit ?? 3"]
    d1 -- no --> d2{"s.run set OR name === 'run'?"}
    d2 -- yes --> run["kind: run · run? + instructions?"]
    d2 -- no --> work["kind: worker · resolveWorker(use ?? name) → agent? + instructions?"]
    loop --> out["StepPlan { tier, stage, steps }"]
    run --> out
    work --> out
```

## Why

The skill — not a `claude -p` subprocess — is the orchestrator (a subprocess can
not reach the session's Task tool). The planner gives the skill a flat, typed
menu: each `PlanStep` says exactly what to do (spawn agent X, run command Y,
recurse into tier Z) without the skill re-deriving order or worker mapping.

## Wann

Called by the `cli` lifecycle verbs (`plan`/`refine`/`build`/`wrap`) to return
the resolved plan for the requested tier/stage.
