// orchestration/steps-planner/steps-planner.ts — turns the resolved, config-driven steps for a tier/stage
// into a PLAN the in-session skills execute: per step, is it a worker (→ which
// plugin agent to spawn), a bash run, or the loop edge (→ child tier + stop/retry).
// Pure + deterministic; reuses resolve-steps (the each-shorthand + order) and
// worker-dispatch (the step-name → agent mapping). The skill is the orchestrator;
// this is only the menu it reads.
import { createResolveSteps } from '../../domain/steps/resolve-steps/resolve-steps.js'
import { createWorkerDispatch } from '../worker-dispatch/worker-dispatch.js'
import type { Step } from '../../domain/steps/step.js'
import type { PlanStep, StepPlan } from '../../domain/steps/plan.js'

interface BuildCfg {
  stop?: string[]
  retry_limit?: number
}

export function createStepsPlanner(config: Record<string, unknown>) {
  const resolver = createResolveSteps(config)
  const dispatch = createWorkerDispatch()

  const toPlanStep = (s: Step, buildCfg: BuildCfg): PlanStep => {
    // loop edge — the fractal recursion into the child tier
    if (s.each !== undefined) {
      return {
        name: s.name,
        kind: 'loop',
        each: s.each,
        ...(buildCfg.stop ? { stop: buildCfg.stop } : {}),
        retry_limit: buildCfg.retry_limit ?? 3,
      }
    }
    // bash run-step (explicit command, or the bare `run` built-in = "run this child").
    // instructions flows through so the SKILL can follow the run-step's prose guidance
    // when executing it (uniform with use/worker steps — every step kind can carry
    // prose). The framework default run-steps need none, but a user's step may.
    if (s.run !== undefined || s.name === 'run') {
      return {
        name: s.name,
        kind: 'run',
        ...(s.run !== undefined ? { run: s.run } : {}),
        ...(s.instructions !== undefined ? { instructions: s.instructions } : {}),
      }
    }
    // worker — resolve the step name to its plugin agent (the skill spawns it)
    const ref = dispatch.resolveWorker(s.use ?? s.name)
    return {
      name: s.name,
      kind: 'worker',
      ...(ref ? { agent: ref.ref } : {}),
      ...(s.instructions !== undefined ? { instructions: s.instructions } : {}),
    }
  }

  return {
    plan(tier: string, stage: string): StepPlan {
      const tierBlock = config[tier] as Record<string, BuildCfg> | undefined
      const buildCfg = (tierBlock?.build ?? {}) as BuildCfg
      const steps = resolver.resolve(tier, stage).map((s) => toPlanStep(s, buildCfg))
      return { tier, stage, steps }
    },
  }
}
