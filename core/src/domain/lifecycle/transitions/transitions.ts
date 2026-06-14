// state/transitions.ts — per-tier forward-only state machine. One tier-generic
// assertTransition parametrised over the tier descriptor (no per-tier dupes).
import { anchoredError } from '../../../lib/utils/error.js'
import { lifecycleTransitions, phaseTransitions } from '../../../lib/constants/transitions.js'

// Allowed forward edges per tier, assembled from the shared lib maps. The only
// backward edge is the update-mode re-entry to `drafted`. X→X is idempotent.
// D1: epic·task·project all mirror the uniform lifecycle (same words + edges).
const TRANSITIONS: Record<string, Record<string, readonly string[]>> = {
  phase: phaseTransitions,
  task: lifecycleTransitions,
  epic: lifecycleTransitions,
  project: lifecycleTransitions,
}

export interface TierLike {
  tier: string
}

/** Assert a status transition is legal for the given tier; no-op when from===to. */
export function assertTransition(descriptor: TierLike, from: string, to: string): void {
  if (from === to) return // idempotent self-transition
  const allowed = TRANSITIONS[descriptor.tier]?.[from] ?? []
  if (!allowed.includes(to)) {
    throw anchoredError(
      'InvalidTransition',
      `illegal ${descriptor.tier} transition: ${from} → ${to}`,
      allowed.length > 0 ? [...allowed] : ['(terminal state — no further transitions)'],
    )
  }
}

export { TRANSITIONS }
