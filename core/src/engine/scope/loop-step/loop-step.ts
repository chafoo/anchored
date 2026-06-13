// engine/scope/loop-step.ts — where the fractal closes. each: → run the child
// tier per child. Two modes: SEQUENTIAL (default; interleaved body per child,
// advance via next-child, retry to retry_limit, then halt) and WORKFLOW (opt-in;
// fan-out the children to the injected workflow seam — Task workflow-mode, the
// orchestration lives in loop-workflow.ts). stopCheck is a pure function;
// routeStopVerdict routes it to ops.
import type { Step } from '../../../schema/step/step.js'
import { runStep } from '../run-step/run-step.js'
import { workerStep } from '../worker-step.js'
import { workflowLoop } from '../loop-workflow/loop-workflow.js'
import type { AnyNode, RunCtx, RunnerDeps, StepResult, TierCfg } from '../../step-runner.js'

const CHILD_FIELD: Record<string, string> = { phase: 'phases', task: 'tasks', epic: 'epics' }

export type StopVerdict = 'PROCEED' | 'STOP'

/** Pure stop-check: a build-time decision STOPs if it matches a stop rule
 *  (deterministic substitute for the LLM judge). PROCEED otherwise. */
export function stopCheck(decision: string, stopRules: string[]): StopVerdict {
  const d = decision.toLowerCase()
  return stopRules.some((r) => {
    const rule = r.toLowerCase()
    return d.includes(rule) || rule.includes(d)
  })
    ? 'STOP'
    : 'PROCEED'
}

/** Route a stop verdict to ops: STOP escalates (high question), PROCEED documents
 *  the autonomous decision in the log. */
export async function routeStopVerdict(
  node: AnyNode,
  decision: string,
  stopRules: string[],
  deps: RunnerDeps,
): Promise<{ node: AnyNode; verdict: StopVerdict }> {
  const verdict = stopCheck(decision, stopRules)
  if (verdict === 'STOP') {
    const n = await deps.ops.addQuestion(node, {
      text: decision,
      priority: 'high',
      origin: 'stop-check',
    })
    return { node: n, verdict }
  }
  const n = await deps.ops.appendLog(node, {
    at: 'stop-check',
    kind: 'decision',
    note: `PROCEED: ${decision}`,
  })
  return { node: n, verdict }
}

interface BuildCfg {
  stop?: string[]
  retry_limit?: number
  mode?: string
}

function childOf(parent: AnyNode, childTier: string, slug: string): AnyNode {
  const field = CHILD_FIELD[childTier] ?? 'children'
  const children = (parent[field] as AnyNode[] | undefined) ?? []
  return children.find((c) => c.slug === slug) ?? { slug, status: 'pending' }
}

function isRunBuiltin(step: Step): boolean {
  return (
    step.name === 'run' &&
    step.run === undefined &&
    step.use === undefined &&
    step.each === undefined
  )
}

async function runBody(
  body: Step[],
  childTier: string,
  childNode: AnyNode,
  ctx: RunCtx,
  deps: RunnerDeps,
): Promise<StepResult> {
  let current = childNode
  for (const bstep of body) {
    let r: StepResult
    if (isRunBuiltin(bstep)) {
      r = await deps.runChildTier(childTier, current) // close the recursion
    } else if (bstep.run !== undefined) {
      r = await runStep(bstep, current, deps)
    } else {
      r = await workerStep(bstep, current, ctx, deps)
    }
    current = r.node
    if (r.status === 'failed') return { node: current, status: 'failed', error: r.error }
  }
  return { node: current, status: 'ok' }
}

export async function loopStep(
  step: Step,
  node: AnyNode,
  ctx: RunCtx,
  cfg: TierCfg,
  deps: RunnerDeps,
): Promise<StepResult> {
  const childTier = step.each
  if (!childTier) return { node, status: 'failed', error: 'loop step has no each tier' }
  const buildCfg = (cfg.build ?? {}) as BuildCfg

  // WORKFLOW mode (opt-in): fan-out to the injected seam (Task workflow-mode)
  if (buildCfg.mode === 'workflow') return workflowLoop(node, childTier, buildCfg, deps.workflow)

  // SEQUENTIAL mode (default): interleaved body per child, advance, retry, halt
  const retryLimit = buildCfg.retry_limit ?? 3
  const body = step.steps && step.steps.length > 0 ? step.steps : [{ name: 'run' }]

  let current = node
  for (;;) {
    const next = deps.ops.nextChild(current)
    if (!next) break
    const childNode = childOf(current, childTier, next.slug)

    let ok = false
    for (let attempt = 1; attempt <= retryLimit; attempt++) {
      const r = await runBody(body, childTier, childNode, ctx, deps)
      if (r.status === 'ok') {
        ok = true
        break
      }
    }

    current = await deps.ops.setChildStatus(current, next.slug, ok ? 'done' : 'blocked')
    if (!ok) {
      // retry budget exhausted → the loop halts (escalates)
      return {
        node: current,
        status: 'failed',
        error: `child ${next.slug} failed after ${retryLimit} attempts`,
      }
    }
  }
  return { node: current, status: 'ok' }
}
