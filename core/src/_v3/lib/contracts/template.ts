// _v3/lib/contracts/template.ts — the template capability (modules↔template). The second
// service: merge the shipped default template ⊕ the user's anchored.yml, validate, and
// SERVE the steps + custom fields. The step order + the worker per step are DATA in the
// template — `steps()` is a trivial accessor, there is no plan algorithm. Interface-only.

/** One step in a stage — pure DATA (the worker ref is inline, not resolved by code). */
export interface Step {
  name: string
  worker?: string // the plugin agent/skill to spawn (inline template data)
  run?: string // a bash command
  each?: string // loop: the child tier to iterate
  stop?: string[]
  retry_limit?: number
  instructions?: string
}

/** A resolved tier/stage step plan — the menu a skill reads + executes. */
export interface StepPlan {
  tier: string
  stage: string
  steps: Step[]
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
