// engine/scope/loop-workflow.ts — the WORKFLOW-mode orchestration behind the
// injected workflow seam (Task workflow-mode).
//
// REFERENCE / HEADLESS PATH (dogfood-fixings q4): in the skill-orchestrated runtime
// the *build skill* drives the workflow fan-out via the Claude-Code `Workflow` tool
// (`agentType: a:build-workflow`) — see plugin/skills/build/SKILL.md. THIS module is
// the engine's deterministic reference of the same shape (dispatch → evidence-driven
// collect → gates once over merged → stop/retry), kept fully tested for a future
// headless `claude -p` engine path; it is NOT the live skill path. The two must stay
// behaviourally equivalent.
//
// Where the SEQUENTIAL loop runs an interleaved body per child, this fans the
// children OUT as a background workflow (≤16 batches), then re-collects evidence from
// the task-file state and runs the wrap-gates ONCE over the merged result. Three
// guarantees mirror the sequential path: stop-conditions halt the loop, failing
// children retry to retry_limit, and the hard invariant (no ac→done without evidence)
// stays in the substrate. The seam is injected, so the whole path is fakeable.
import { stopCheck } from '../loop-step/loop-step.js'
import type {
  AnyNode,
  MergedResult,
  StepResult,
  WorkflowUnit,
} from '../../step-runner/step-runner.js'
import type { WorkflowSeam } from '../../step-runner/step-runner.js'

export const WORKFLOW_CAP = 16
const CHILD_FIELD: Record<string, string> = { phase: 'phases', task: 'tasks', epic: 'epics' }

interface AcLike {
  status?: string
  evidence?: unknown[]
}

export interface WorkflowBuildCfg {
  stop?: string[]
  retry_limit?: number
}

/** Worker selection follows the unit's executor field: executor=workflow → the
 *  workflow worker, anything else (implement, or unset) → the implement worker. */
export function selectWorker(child: AnyNode): string {
  return child.executor === 'workflow' ? 'workflow' : 'implement'
}

/** A unit is complete (skippable on re-entry) when its build is evidence-backed:
 *  either the child is already `done`, or every acceptance criterion is `done`
 *  WITH evidence. Evidence-driven — not workflow-resume-dependent. */
export function isUnitComplete(child: AnyNode): boolean {
  if (child.status === 'done') return true
  const acs = child.acceptance_criteria as AcLike[] | undefined
  if (acs && acs.length > 0) {
    return acs.every(
      (a) => a.status === 'done' && Array.isArray(a.evidence) && a.evidence.length > 0,
    )
  }
  return false
}

/** Partition the collected children into done vs failed/open by evidence. */
export function partition(children: AnyNode[]): { done: AnyNode[]; failed: AnyNode[] } {
  const done: AnyNode[] = []
  const failed: AnyNode[] = []
  for (const c of children) (isUnitComplete(c) ? done : failed).push(c)
  return { done, failed }
}

/** A child flags a stop-condition when one of its failures matches a stop rule. */
function stopFlagged(children: AnyNode[], stopRules: string[]): AnyNode | undefined {
  if (stopRules.length === 0) return undefined
  return children.find((c) => {
    const fails = (c.failures as string[] | undefined) ?? []
    return fails.some((f) => stopCheck(f, stopRules) === 'STOP')
  })
}

const childrenOf = (parent: AnyNode, field: string): AnyNode[] =>
  (parent[field] as AnyNode[] | undefined) ?? []

/** The WORKFLOW loop: fan-out open children to the seam (≤16 batches), collect
 *  evidence from the task-file state, run the gates once over the merged result,
 *  honour stop-conditions, and retry failing children to retry_limit. */
export async function workflowLoop(
  parent: AnyNode,
  childTier: string,
  cfg: WorkflowBuildCfg,
  seam: WorkflowSeam | undefined,
): Promise<StepResult> {
  if (!seam) return { node: parent, status: 'ok' }
  const field = CHILD_FIELD[childTier] ?? 'children'
  const retryLimit = cfg.retry_limit ?? 3
  const stopRules = cfg.stop ?? []

  let current = parent
  let merged: MergedResult = { node: current, ...partition(childrenOf(current, field)) }

  for (let attempt = 1; attempt <= retryLimit; attempt++) {
    // evidence-driven skip: only OPEN children are dispatched (done ones are left)
    const open = childrenOf(current, field).filter((c) => !isUnitComplete(c))
    if (open.length === 0) break

    const units: WorkflowUnit[] = open.map((child) => ({
      childTier,
      child,
      worker: selectWorker(child),
    }))
    // deterministic ≤16 batching; background dispatch (no await of completion)
    for (let i = 0; i < units.length; i += WORKFLOW_CAP) {
      await seam.dispatch(units.slice(i, i + WORKFLOW_CAP))
    }

    // collect: re-read the parent's persisted state (NOT a workflow-resume handle)
    current = await seam.collect(current)
    merged = { node: current, ...partition(childrenOf(current, field)) }

    // wrap-gates run ONCE over the merged result; a gate-failure self-writes
    // failures to the affected child, so we re-collect to observe them
    if (seam.gates) {
      const g = await seam.gates(current, merged)
      if (!g.ok) {
        current = await seam.collect(current)
        merged = { node: current, ...partition(childrenOf(current, field)) }
      }
    }

    // a unit flagging a stop-condition halts the loop AFTER the collect
    const stopped = stopFlagged(childrenOf(current, field), stopRules)
    if (stopped) {
      return {
        node: current,
        status: 'failed',
        error: `workflow halted: stop condition flagged by '${stopped.slug}'`,
      }
    }

    if (merged.failed.length === 0) return { node: current, status: 'ok' }
    // else: another attempt — already-green children are skipped next round
  }

  if (merged.failed.length > 0) {
    return {
      node: current,
      status: 'failed',
      error: `workflow children unresolved after ${retryLimit} attempts: ${merged.failed
        .map((c) => c.slug)
        .join(', ')}`,
    }
  }
  return { node: current, status: 'ok' }
}
