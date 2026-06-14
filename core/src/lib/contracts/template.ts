// _v3/lib/contracts/template.ts — the template capability (modules↔template). The second
// service: merge the shipped default template ⊕ the user's anchored.yml, validate, and
// SERVE the steps + custom fields. The step order + the worker per step are DATA in the
// template — `steps()` is a trivial accessor, there is no plan algorithm. Interface-only.

/** One step in a stage — pure DATA (the worker ref is INLINE, not resolved by code). */
export interface Step {
  name: string
  worker?: string // the plugin agent/skill to spawn (inline template data)
  type?: 'agent' | 'skill' // how to dispatch the worker (walk is a skill)
  run?: string // a bash command
  involve?: 'all' | 'high-only' | 'none' // the q&a walk style (walk step)
  before?: string // merge: insert this user step before a built-in
  after?: string // merge: insert after a built-in
  instructions?: string
}

/** A resolved tier/stage step plan — the menu a skill reads + executes. The loop edge
 *  (`each` + stop/retry) is stage-level, carried here, not on a step. */
export interface StepPlan {
  tier: string
  stage: string
  steps: Step[]
  each?: string // the fractal child tier to iterate (build stage)
  stop?: string[]
  retry_limit?: number
}

export interface TemplatePort {
  /** the step list for a tier+stage — read straight from the merged template. */
  steps(tier: string, stage: string): StepPlan
  /** the config-declared custom fields for a tier (the module applies them to its schema). */
  fields(tier: string): Record<string, string>
  /** check the merged anchored.yml is valid + every tier×stage resolves — backs `validate`. */
  validate(): unknown
  /** the raw merged config. */
  raw(): Record<string, unknown>
}
