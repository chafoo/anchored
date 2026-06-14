// lib/constants/statuses.ts — the fixed status axes, defined ONCE. These are pure
// values with no behaviour: the tier modules build their schemas + condition
// bundles from them, and the generic store reads them off the injected bundle.
// Centralising them here (alongside stages.ts) is what lets a module and the
// service agree on an enum WITHOUT importing each other (the core inversion).

// The lifecycle status axis shared by epic·task·project — every non-leaf tier
// walks the same plan→drafted→refined→build→wrap→done form (the fractal).
export const lifecycleStatusValues = [
  'plan',
  'drafted',
  'refined',
  'build',
  'wrap',
  'done',
] as const

// The phase (leaf) status axis — a phase has no sub-lifecycle, it is worked once.
export const phaseStatusValues = ['pending', 'in-progress', 'done', 'blocked', 'deferred'] as const

// The child-STUB loop-queue marker (epic's task-stubs, project's epic-stubs). NOT
// the child's own lifecycle — a coarse queue state the parent tracks. 'active' is
// the in-flight marker (never the phase word 'in-progress' — that mismatch bricked
// an epic in the dogfood).
export const stubStatusValues = ['pending', 'active', 'done', 'blocked'] as const

// Reserved phase executor axis (workflow-mode): a phase is worked by the default
// implement worker or fanned out as a workflow.
export const phaseExecutorValues = ['implement', 'workflow'] as const
