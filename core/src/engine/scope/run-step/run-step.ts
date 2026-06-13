// engine/scope/run-step.ts — run: → Bash, via the injected run seam (no direct
// child_process import). Returns the canonical { node, status, evidence }.
import type { Step } from '../../../schema/step/step.js'
import type { AnyNode, StepResult, RunnerDeps } from '../../step-runner.js'

export async function runStep(step: Step, node: AnyNode, deps: RunnerDeps): Promise<StepResult> {
  const r = await deps.run(step.run ?? '')
  if (r.code !== 0) {
    return { node, status: 'failed', error: r.stderr || `exit ${r.code}` }
  }
  return { node, status: 'ok', evidence: r.stdout ? [r.stdout] : [] }
}
