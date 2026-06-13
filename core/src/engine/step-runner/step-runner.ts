// engine/step-runner/step-runner.ts — the fractal foundation. createStepRunner(cfg, deps) →
// { run(step, node, ctx) }. Dispatch by step FORM (not name): run → bash seam,
// use|bare-name → worker (spawn seam), each → loop. No hardcoded domain step
// names; the runner only knows the step shape. Shared engine types live here.
import type { Step } from '../../schema/step/step.js'
import { runStep } from '../scope/run-step/run-step.js'
import { loopStep } from '../scope/loop-step/loop-step.js'

export interface AnyNode {
  slug: string
  status: string
  executor?: string
  [k: string]: unknown
}

export interface StepResult {
  node: AnyNode
  status: 'ok' | 'failed'
  evidence?: string[]
  error?: string
}

export interface RunCtx {
  tier: string
  stage: string
}

export interface ExecOut {
  code: number
  stdout: string
  stderr: string
}

export interface SpawnLike {
  run(input: {
    tier: string
    slug: string
    stage: string
    instructions: string
    cwd?: string
    context?: string
    executor?: string
  }): Promise<{ ok: boolean; kind: string; evidence?: string[]; error?: string }>
}

export interface OpsLike {
  setStatus(node: AnyNode, to: string): Promise<AnyNode>
  nextChild(node: AnyNode): { slug: string; status: string } | null
  addQuestion(
    node: AnyNode,
    init: { text: string; priority: 'low' | 'medium' | 'high'; origin?: string },
  ): Promise<AnyNode>
  resolveQuestion(
    node: AnyNode,
    id: string,
    r: { answer: string; source: 'user' | 'ai'; reasoning?: string },
  ): Promise<AnyNode>
  appendLog(node: AnyNode, entry: { at: string; kind: string; note: string }): Promise<AnyNode>
  setChildStatus(node: AnyNode, childSlug: string, status: string): Promise<AnyNode>
}

export type TierCfg = Record<string, unknown>

// ── WORKFLOW-mode seam (Task workflow-mode) ──
// One dispatch unit = one child fanned out to the background workflow. The worker
// is chosen by the child's executor field (workflow vs implement).
export interface WorkflowUnit {
  childTier: string
  child: AnyNode
  worker: string
}

// The merged result the collect step produces over ALL children, partitioned by
// evidence (done = ACs evidence-backed; failed = open / failures-bearing).
export interface MergedResult {
  node: AnyNode
  done: AnyNode[]
  failed: AnyNode[]
}

// The injected workflow seam. dispatch() is BACKGROUND-only (resolves when the
// units are dispatched, not when they complete); collect() re-reads the parent's
// persisted state (evidence-driven, NOT a workflow-resume handle); gates() runs
// the wrap-gates ONCE over the merged result.
export interface WorkflowSeam {
  dispatch(units: WorkflowUnit[]): Promise<void>
  collect(parent: AnyNode): Promise<AnyNode>
  gates?(parent: AnyNode, merged: MergedResult): Promise<{ ok: boolean }>
}

export interface RunnerDeps {
  run: (cmd: string, opts?: { cwd?: string }) => Promise<ExecOut>
  spawn: SpawnLike
  ops: OpsLike
  descriptorFor: (tier: string) => { childTier?: string | undefined }
  runChildTier: (tier: string, node: AnyNode) => Promise<StepResult>
  workflow?: WorkflowSeam
}

// The use|bare-name dispatch leaf: an AI effect through the injected spawn seam.
// (Was engine/scope/worker-step.ts — that module is deleted with the headless
// engine-run path; the spawn-free body is inlined here until step-runner itself is
// removed wholesale in the engine-chain phase.)
async function workerStep(
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

export function createStepRunner(cfg: TierCfg, deps: RunnerDeps) {
  return {
    async run(step: Step, node: AnyNode, ctx: RunCtx): Promise<StepResult> {
      if (step.each !== undefined) return loopStep(step, node, ctx, cfg, deps)
      if (step.run !== undefined) return runStep(step, node, deps)
      return workerStep(step, node, ctx, deps)
    },
  }
}
