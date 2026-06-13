// engine/stage-runner.ts — createStageRunner(cfg, deps) → { run }. Runs the steps
// of ONE stage in order, reusing createStepRunner per step. A failed step short-
// circuits the stage.
import type { Step } from '../schema/step/step.js'
import { createStepRunner } from './step-runner/step-runner.js'
import type { AnyNode, RunCtx, RunnerDeps, StepResult, TierCfg } from './step-runner/step-runner.js'

export function createStageRunner(cfg: TierCfg, deps: RunnerDeps) {
  const stepRunner = createStepRunner(cfg, deps)
  return {
    async run(stage: string, steps: Step[], node: AnyNode, tier: string): Promise<StepResult> {
      const ctx: RunCtx = { tier, stage }
      let current = node
      for (const step of steps) {
        const r = await stepRunner.run(step, current, ctx)
        current = r.node
        if (r.status === 'failed') return { node: current, status: 'failed', error: r.error }
      }
      return { node: current, status: 'ok' }
    },
  }
}
