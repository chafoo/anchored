// _v3/lib/contracts/template.ts — the template capability (modules↔template). The second
// service: merge the shipped default template ⊕ the user's anchored.yml, validate, and
// SERVE the steps + custom fields. The step order + the worker per step are DATA in the
// template — `steps()` is a trivial accessor, there is no plan algorithm. Interface-only.

/** A step's worker: the plugin agent/skill to spawn, with how to dispatch it. Inline template
 *  DATA — there is no worker-dispatch code; the skill reads `use` and spawns it. */
export interface StepUse {
  type: 'agent' | 'skill' // agent = isolated subagent (Task tool); skill = in-session skill
  name: string // the plugin agent/skill to spawn
}

/** One step in a stage — pure DATA (the worker ref is INLINE, not resolved by code).
 *  requirements-3 shape: prose for the main thread (`instructions`), an optional worker
 *  (`use`), an optional fan-out mode (`execute`). No `run` (say it in prose); no bare
 *  `worker`/`type` (folded into `use`). */
export interface Step {
  name: string
  instructions?: string // prose for the main thread (incl. "run npm test" — replaces `run:`)
  use?: StepUse // the worker to spawn (agent or skill)
  execute?: 'sequential' | 'workflow' // default sequential; workflow = fan this step out
  involve?: 'all' | 'high-only' | 'none' // the q&a walk style (walk step only)
  before?: string // merge: insert this user step before a built-in
  after?: string // merge: insert after a built-in
  with?: string // parallel positioner: run in this named step's parallel batch (sibling of before/after)
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
