// services/store/transitions/transitions.ts — the generic forward-only transition
// guard. It reads the legal edges OFF the injected condition bundle
// (descriptor.transitions) — it knows no concrete tier. A write-path mechanism,
// store-internal; the per-tier edge maps live in lib/constants + the bundles.
import { anchoredError } from '../../../lib/utils/error.js'

export interface TransitionLike {
  tier: string
  transitions: Record<string, readonly string[]>
}

/** Assert a status transition is legal for the given tier; no-op when from===to. */
export function assertTransition(descriptor: TransitionLike, from: string, to: string): void {
  if (from === to) return // idempotent self-transition
  const allowed = descriptor.transitions[from] ?? []
  if (!allowed.includes(to)) {
    throw anchoredError(
      'InvalidTransition',
      `illegal ${descriptor.tier} transition: ${from} → ${to}`,
      allowed.length > 0 ? [...allowed] : ['(terminal state — no further transitions)'],
    )
  }
}
