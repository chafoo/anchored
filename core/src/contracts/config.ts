// contracts/config.ts — the config capability: load + merge (default ⊕ user, once)
// and derive a step-plan per tier/stage. Fully pure given injected readers; the plan
// types are the public surface between config and the skills that execute the plan.
// Interface-only.

/** One executable step in a stage plan: a worker to spawn, a bash run, or a loop edge. */
export interface PlanStep {
  name: string
  kind: 'worker' | 'run' | 'loop'
  agent?: string // worker: the plugin agent to spawn (build-implement, …)
  run?: string // run: the bash command
  instructions?: string // prose guidance for the SKILL — uniform across run/use/worker
  each?: string // loop: the child tier to iterate
  stop?: string[]
  retry_limit?: number
}

/** A full tier/stage step plan — the menu a skill consults and executes. */
export interface StepPlan {
  tier: string
  stage: string
  steps: PlanStep[]
}

/** A loaded, merged config bound to a project root. */
export interface ConfigPort {
  /** The step plan for a tier+stage (expands `build:{each}` into a loop edge). */
  planFor(tier: string, stage: string): StepPlan
  /** Declared custom fields for a tier (so the store validates them on read+write). */
  fields(tier: string): Record<string, string>
  /** The raw merged config, for the `validate` command + custom-field extension. */
  raw(): Record<string, unknown>
}
