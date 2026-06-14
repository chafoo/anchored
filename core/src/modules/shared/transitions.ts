// _v3/modules/shared/transitions.ts — the forward-only state-machine edges (as pure data)
// + the guard a tier module calls in its `status` verb. Tier knowledge — only the modules
// use it now that the store is dumb. epic·task·project share one identical lifecycle map.
import { anchoredError } from '../../lib/utils/error.js'

/** Allowed forward edges keyed by from-status. X→X is idempotent (handled by the asserter). */
export type TransitionMap = Record<string, readonly string[]>

// epic·task·project — the uniform lifecycle, incl. the single backward update-mode re-entry.
export const lifecycleTransitions: TransitionMap = {
  plan: ['drafted'],
  drafted: ['refined'],
  refined: ['build', 'drafted'],
  build: ['wrap', 'drafted'],
  wrap: ['done', 'drafted'],
  done: ['drafted'],
}

// the leaf tier — picked up, then terminates (blocked resumes; done/deferred terminal).
export const phaseTransitions: TransitionMap = {
  pending: ['in-progress'],
  'in-progress': ['done', 'blocked', 'deferred'],
  blocked: ['in-progress'],
  done: [],
  deferred: [],
}

/** Assert a status transition is legal against the tier's map; no-op when from===to. */
export function assertTransition(
  transitions: TransitionMap,
  from: string,
  to: string,
  tier = 'node',
): void {
  if (from === to) return
  const allowed = transitions[from] ?? []
  if (!allowed.includes(to)) {
    throw anchoredError(
      'InvalidTransition',
      `illegal ${tier} transition: ${from} → ${to}`,
      allowed.length > 0 ? [...allowed] : ['(terminal state — no further transitions)'],
    )
  }
}
