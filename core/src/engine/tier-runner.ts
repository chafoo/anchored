// engine/tier-runner.ts — createTierRunner(tier, cfg, deps) → { run(node) }. Runs
// plan→refine→build→wrap of one node in order. ONE tier-runner serves every tier;
// the only difference is cfg (from anchored.default.yml) + node (data).
import { createStageRunner } from './stage-runner.js'
import { resolveSteps } from './scope/resolve-steps/resolve-steps.js'
import type { AnyNode, RunnerDeps, StepResult, TierCfg } from './step-runner.js'

const STAGES = ['plan', 'refine', 'build', 'wrap'] as const

export function createTierRunner(tier: string, cfg: TierCfg, deps: RunnerDeps) {
  const stageRunner = createStageRunner(cfg, deps)
  return {
    async run(node: AnyNode): Promise<StepResult> {
      let current = node
      for (const stage of STAGES) {
        const steps = resolveSteps(cfg[stage] as Parameters<typeof resolveSteps>[0])
        const r = await stageRunner.run(stage, steps, current, tier)
        current = r.node
        if (r.status === 'failed') return { node: current, status: 'failed', error: r.error }
      }
      return { node: current, status: 'ok' }
    },
  }
}
