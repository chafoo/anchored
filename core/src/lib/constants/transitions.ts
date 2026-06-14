// lib/constants/transitions.ts — the forward-only state-machine edges, as pure
// data. A tier module declares which map it uses in its condition bundle; the
// generic store reads the map off the bundle and asserts each transition. Kept in
// lib (not a module) because epic·task·project share one identical map — a module
// references it, it is not duplicated three times.

/** Allowed forward edges keyed by from-status. The only backward edge is the
 *  update-mode re-entry to `drafted` (refined/build/wrap/done → drafted); X→X is
 *  idempotent and handled by the asserter, not encoded here. */
export type TransitionMap = Record<string, readonly string[]>

// epic·task·project share the same forward-only lifecycle (same words + edges),
// incl. the backward update-mode re-entry to `drafted`.
export const lifecycleTransitions: TransitionMap = {
  plan: ['drafted'],
  drafted: ['refined'],
  refined: ['build', 'drafted'],
  build: ['wrap', 'drafted'],
  wrap: ['done', 'drafted'],
  done: ['drafted'],
}

// the leaf tier's edges — a phase is picked up, then terminates (done/blocked can
// resume; deferred is terminal).
export const phaseTransitions: TransitionMap = {
  pending: ['in-progress'],
  'in-progress': ['done', 'blocked', 'deferred'],
  blocked: ['in-progress'],
  done: [],
  deferred: [],
}
