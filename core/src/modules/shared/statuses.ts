// _v3/modules/shared/statuses.ts — the fixed status axes, as pure data. Only the tier
// modules use them (in their schemas + child relationships) now that the store is dumb,
// so they live with the modules, not in lib.

// The lifecycle axis shared by epic·task — the uniform plan→done form.
export const lifecycleStatusValues = [
  'plan',
  'drafted',
  'refined',
  'build',
  'wrap',
  'done',
] as const

// The phase (leaf) axis — worked once, no sub-lifecycle.
export const phaseStatusValues = ['pending', 'in-progress', 'done', 'blocked', 'deferred'] as const

// The child-STUB loop-queue marker (epic's task-stubs). 'active' is
// the in-flight marker (never the phase word 'in-progress' — that mismatch bricked an epic).
export const stubStatusValues = ['pending', 'active', 'done', 'blocked'] as const
