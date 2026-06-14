// _v3/modules/epic/epic.schemas.ts — the epic node schema. childTier = task: holds coarse
// task STUBS (the loop queue) — never full phases (those live in the task files). Mirrors
// the task lifecycle exactly. Composed from the shared fragments; the stub is defined HERE
// so epic needs no sideways import of the task module.
import { z } from 'zod'
import { lifecycleStatusValues, stubStatusValues } from '../shared/statuses.js'
import {
  KebabSlug,
  AcceptanceCriterion,
  QuestionSchema,
  LogEntrySchema,
  ContextTrails,
} from '../shared/fragments.schemas.js'

export const EpicStatus = z.enum(lifecycleStatusValues)

// the epic DoD item carries delivery evidence (the roll-up's provenance) — required before
// it flips done (a halluc-roll-up can't stamp the whole epic delivered with no backing).
const AcceptanceItem = z.strictObject({
  id: z.string(),
  text: z.string(),
  status: z.enum(['pending', 'done']),
  evidence: z.array(z.string()).optional(),
})

const TaskStub = z.strictObject({
  slug: KebabSlug,
  goal: z.string().optional(),
  status: z.enum(stubStatusValues),
  depends_on: z.array(KebabSlug).optional(),
  // outcome-level task-ACs epic-refine works out per stub — same AC shape as a phase.
  acceptance_criteria: z.array(AcceptanceCriterion).optional(),
})

export const EpicNodeSchema = z.strictObject({
  schema_version: z.number().int(),
  slug: KebabSlug,
  title: z.string(),
  status: EpicStatus,
  created: z.string().optional(),
  goal: z.string().optional(),
  context: ContextTrails.optional(),
  acceptance: z.array(AcceptanceItem).optional(),
  questions: z.array(QuestionSchema).optional(),
  concerns: z.array(QuestionSchema).optional(),
  tasks: z.array(TaskStub).optional(),
  log: z.array(LogEntrySchema).optional(),
})

export type EpicNode = z.infer<typeof EpicNodeSchema>
