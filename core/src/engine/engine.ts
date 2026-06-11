// engine/engine.ts — createEngine(deps) → { run(tier, node) }. The outermost
// factory: resolves the tier-matching cfg and runs the tier-runner. run is passed
// down as runChildTier, so the loop-step closes the recursion (engine-architecture).
import { createTierRunner } from './tier-runner.js'
import type {
  AnyNode,
  OpsLike,
  RunnerDeps,
  SpawnLike,
  StepResult,
  TierCfg,
  WorkflowSeam,
} from './step-runner.js'

export interface EngineDeps {
  config: Record<string, TierCfg>
  run: RunnerDeps['run']
  spawn: SpawnLike
  ops: OpsLike
  descriptorFor: (tier: string) => { childTier?: string | undefined }
  workflow?: WorkflowSeam
}

export function createEngine(deps: EngineDeps) {
  const runNode = async (tier: string, node: AnyNode): Promise<StepResult> => {
    const cfg = deps.config[tier] ?? {}
    const runnerDeps: RunnerDeps = {
      run: deps.run,
      spawn: deps.spawn,
      ops: deps.ops,
      descriptorFor: deps.descriptorFor,
      runChildTier: runNode, // recursion hook
      workflow: deps.workflow,
    }
    return createTierRunner(tier, cfg, runnerDeps).run(node)
  }
  return { run: runNode }
}
