// state/transitions.ts — per-tier forward-only state machine. One tier-generic
// assertTransition parametrised over the tier descriptor (no per-tier dupes).
import { anchoredError } from '../../../error.js'

// Allowed forward edges per tier. The only backward edge is task's update-mode
// re-entry to `drafted` (refined/build/wrap/done → drafted). X→X is idempotent.
const TRANSITIONS: Record<string, Record<string, readonly string[]>> = {
  phase: {
    pending: ['in-progress'],
    'in-progress': ['done', 'blocked', 'deferred'],
    blocked: ['in-progress'],
    done: [],
    deferred: [],
  },
  task: {
    plan: ['drafted'],
    drafted: ['refined'],
    refined: ['build', 'drafted'],
    build: ['wrap', 'drafted'],
    wrap: ['done', 'drafted'],
    done: ['drafted'],
  },
  // D1: epic mirrors task's forward-only lifecycle exactly (same words + edges),
  // incl. the backward update-mode re-entry to `drafted`.
  epic: {
    plan: ['drafted'],
    drafted: ['refined'],
    refined: ['build', 'drafted'],
    build: ['wrap', 'drafted'],
    wrap: ['done', 'drafted'],
    done: ['drafted'],
  },
  // project stays RESERVED on the reduced enum (q6: out of scope until exercised).
  project: {
    planning: ['building'],
    building: ['done'],
    done: [],
  },
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
