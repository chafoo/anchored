// _v3/modules/shared/receipts.ts — step-receipt transforms (pure) + the stage-closing guard.
// The step-ENFORCEMENT mechanism: the template serves which steps a stage has (policy); the
// tier modules record a receipt per executed step (`step done` / `step skip`) and call
// `assertStepsReceipted` in the `status` verb that closes the stage. A stage the state
// machine legally skips (drafted → build, build → done) is never checked — the guard only
// fires for the stage the transition actually closes. Tier-agnostic, like children.ts.
import { anchoredError } from '../../lib/utils/error.js'

export interface StepReceiptLike {
  stage: string
  step: string
  status: string // 'done' | 'skipped' (the schema enforces the enum + the skip reason)
  note?: string
}

/** Upsert a receipt keyed by (stage, step) — re-running a step overwrites its receipt. */
export function recordReceipt(
  receipts: StepReceiptLike[],
  receipt: StepReceiptLike,
): StepReceiptLike[] {
  const idx = receipts.findIndex((r) => r.stage === receipt.stage && r.step === receipt.step)
  if (idx < 0) return [...receipts, receipt]
  return receipts.map((r, i) => (i === idx ? receipt : r))
}

/**
 * Which stage a lifecycle (epic·task) transition CLOSES — keyed by from→to. The skip edges
 * (drafted → build, build → done) close nothing for the skipped stage: the state machine
 * allows the skip, so the receipts only gate the stage actually being left behind.
 */
export function stageClosedBy(from: string, to: string): string | undefined {
  if (from === 'plan' && to === 'drafted') return 'plan'
  if (from === 'drafted' && to === 'refined') return 'refine'
  if (from === 'build' && (to === 'wrap' || to === 'done')) return 'build'
  if (from === 'wrap' && to === 'done') return 'wrap'
  return undefined
}

/**
 * The stage-closing gate: every step the template serves for `stage` must carry a receipt
 * (done, or skipped with its documented reason). Throws `StepsUnreceipted` listing the
 * missing steps; a stage with no steps passes trivially.
 */
export function assertStepsReceipted(
  required: { name: string }[],
  receipts: StepReceiptLike[],
  stage: string,
  tier = 'node',
): void {
  const have = new Set(receipts.filter((r) => r.stage === stage).map((r) => r.step))
  const missing = required.filter((s) => !have.has(s.name)).map((s) => s.name)
  if (missing.length > 0) {
    throw anchoredError(
      'StepsUnreceipted',
      `cannot close ${tier} ${stage}: step(s) without a receipt — ${missing.join(', ')}`,
      [
        `receipt each executed step: <tier> step done <slug> ${stage} <step> "<rollup>"`,
        `or document a skip: <tier> step skip <slug> ${stage} <step> "<reason>"`,
      ],
    )
  }
}
