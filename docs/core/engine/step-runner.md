← [engine](_engine.md)

# step-runner

Runs **one** step. Dispatches based on the step form to one of three
helpers: `run` → Bash, `use` → worker, `each` → loop (recursion). The step form
is structural ([schema/step](../schema/_schema.md)); the built-in semantics
live in [resolve-steps](scope/resolve-steps.md), not here.

## What

- `createStepRunner(cfg, deps) → { run(step, node) → output }`.
- Exactly one applies: `run:` (shell), `use:` (`agent|skill` worker), `each:`
  (loop over the child tier). `run` XOR `use` is structurally enforced.
- `instructions` are uniformly allowed on **every** step type (run/use/worker) — the
  planner passes them through, the skill follows them when executing/dispatching;
  `involve` only on the `walk`.

## How

`createStepRunner(cfg, deps): { run(step: Step, node: Node) => Promise<Output> }`

```mermaid
flowchart TB
    S["step"] --> Q{"run | use | each ?"}
    Q -->|run| RS["scope/run-step → Bash"]
    Q -->|use| WS["scope/worker-step → spawn(agent | claude -p)"]
    Q -->|each| LS["scope/loop-step → recurses into the child tier"]
```
