// engine/scope/worker-step.ts — use: (or a bare built-in name) → AI effect behind
// the injected spawn seam (Task spawn). The worker id is step.use ?? step.name;
// the engine never hardcodes a domain step name. No direct spawn import.
import type { Step } from '../../schema/step/step.js'
import type { AnyNode, StepResult, RunCtx, RunnerDeps } from '../step-runner.js'

export async function workerStep(
  step: Step,
  node: AnyNode,
  ctx: RunCtx,
  deps: RunnerDeps,
): Promise<StepResult> {
  const r = await deps.spawn.run({
    tier: ctx.tier,
    slug: node.slug,
    stage: ctx.stage,
    instructions: step.instructions ?? '',
    executor: node.executor,
  })
  if (!r.ok) return { node, status: 'failed', error: r.error }
  return { node, status: 'ok', evidence: r.evidence ?? [] }
}
