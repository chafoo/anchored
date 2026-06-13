// domain/steps/plan.ts — the resolved, executable step PLAN types. A PlanStep is
// the orchestration menu entry (which worker → which plugin agent, which run
// command, or which loop edge) that the skills consult; a StepPlan is the full
// tier/stage plan. These are pure domain types (the step grammar's executable
// shape) — they live in the step domain, not in the cli transport layer, so the
// store/validate surface and the orchestration planner can reference them without
// reaching up into cli/.
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

export interface StepPlan {
  tier: string
  stage: string
  steps: PlanStep[]
}
