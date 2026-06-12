// engine/scope/run-step.ts — run: → Bash, via the injected run seam (no direct
// child_process import). Returns the canonical { node, status, evidence }.
//
// MECHANISM (deterministic, behind the injected `run` seam): when a successful
// run-step carries `provenance: { field, ref? }`, capture `git rev-parse
// <ref|HEAD>` and write the resulting SHA into the node field via ops.setField.
// POLICY (config): WHICH field receives it + WHAT the step committed. The engine
// hand-wires nothing — no step has to `set-field "$(git rev-parse HEAD)"` itself.
import type { Step } from '../../schema/step.js'
import type { AnyNode, StepResult, RunnerDeps } from '../step-runner.js'

export async function runStep(step: Step, node: AnyNode, deps: RunnerDeps): Promise<StepResult> {
  const r = await deps.run(step.run ?? '')
  if (r.code !== 0) {
    return { node, status: 'failed', error: r.stderr || `exit ${r.code}` }
  }
  const evidence = r.stdout ? [r.stdout] : []

  // No provenance → plain run-step result.
  if (step.provenance === undefined) {
    return { node, status: 'ok', evidence }
  }

  // Capture the SHA the user's command produced. The git call goes through the
  // injected `run` seam only — no child_process import in this deep logic.
  const ref = step.provenance.ref ?? 'HEAD'
  const cap = await deps.run('git rev-parse ' + ref)
  if (cap.code !== 0) {
    // The user's command already succeeded — a failed capture must NOT fail the
    // step (e.g. no git repo). Stay ok and surface the miss in the audit trail.
    return {
      node,
      status: 'ok',
      evidence: [...evidence, `provenance: git rev-parse failed (${cap.stderr.trim()})`],
    }
  }
  const sha = cap.stdout.trim()
  const updated = await deps.ops.setField(node, step.provenance.field, sha)
  return { node: updated, status: 'ok', evidence }
}
