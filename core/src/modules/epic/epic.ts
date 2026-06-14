// modules/epic/epic.ts — the epic tier module: a PURE condition bundle. childTier =
// 'task'. Holds coarse task STUBS (the loop queue) — never full phases (those live
// in the task files). Imports only lib + the shared schema base; the task-stub is
// defined HERE from shared fragments, so epic needs no sideways import of the task
// module.
import { z } from 'zod'
import { lifecycleStatusValues, stubStatusValues } from '../../lib/constants/statuses.js'
import { lifecycleTransitions } from '../../lib/constants/transitions.js'
import type { TierCondition } from '../../lib/contracts/tier.js'
import {
  KebabSlug,
  AcceptanceCriterion,
  QuestionSchema,
  LogEntrySchema,
  ContextTrails,
} from '../shared/schema.js'

// D1: the epic tier mirrors the task lifecycle EXACTLY — same words, same forward
// edges — so plan/refine/build/wrap run uniform stage-transitions on every tier.
export const epicStatusValues = lifecycleStatusValues
export const EpicStatus = z.enum(epicStatusValues)

const AcceptanceItem = z.strictObject({
  id: z.string(),
  text: z.string(),
  status: z.enum(['pending', 'done']),
  // M3 (harden-2): the epic DoD item carries delivery evidence (the roll-up's
  // provenance pointers). Required to be non-empty before the item flips done —
  // a halluc-roll-up can't stamp the whole epic delivered with no backing.
  evidence: z.array(z.string()).optional(),
})

const TaskStub = z.strictObject({
  slug: KebabSlug,
  // optional so a bare `add-child` stub is valid (rolling-wave: scaffold/set-field
  // fills the goal); a meaningful stub still carries one.
  goal: z.string().optional(),
  status: z.enum(stubStatusValues),
  depends_on: z.array(KebabSlug).optional(),
  // D2: the OUTCOME-level task-ACs epic-refine works out per stub — same AC shape
  // as a phase, so every generic child-AC op works on a stub unchanged.
  acceptance_criteria: z.array(AcceptanceCriterion).optional(),
})

export const EpicNodeSchema = z.strictObject({
  schema_version: z.number().int(),
  slug: KebabSlug,
  title: z.string(),
  status: EpicStatus,
  created: z.string().optional(),
  goal: z.string().optional(),
  // D1: epic carries the same context trails as task (plan/refine/build/wrap prose).
  context: ContextTrails.optional(),
  acceptance: z.array(AcceptanceItem).optional(),
  questions: z.array(QuestionSchema).optional(),
  // harden-3: "check at the end" threads (see task) — done blocks while open.
  concerns: z.array(QuestionSchema).optional(),
  tasks: z.array(TaskStub).optional(),
  log: z.array(LogEntrySchema).optional(),
})

export type EpicNode = z.infer<typeof EpicNodeSchema>

export const epic: TierCondition = {
  tier: 'epic',
  schema: EpicNodeSchema,
  statusValues: epicStatusValues,
  transitions: lifecycleTransitions,
  defaultStatus: 'plan',
  childTier: 'task',
  childField: 'tasks',
  // children are coarse loop-queue STUBS, not full tasks — the stub marker axis.
  childStatusValues: stubStatusValues,
  childTerminalOk: ['done'],
}
