// _v3/modules/project/project.schemas.ts — the project node schema. childTier = epic: holds
// epic STUBS (the loop queue), mirroring epic's task-stubs. Same uniform lifecycle as
// task/epic. Composed from the shared fragments; the epic-stub is defined HERE.
import { z } from 'zod'
import { lifecycleStatusValues, stubStatusValues } from '../shared/statuses.js'
import {
  KebabSlug,
  AcceptanceCriterion,
  QuestionSchema,
  LogEntrySchema,
  ContextTrails,
} from '../shared/fragments.schemas.js'

export const ProjectStatus = z.enum(lifecycleStatusValues)

const AcceptanceItem = z.strictObject({
  id: z.string(),
  text: z.string(),
  status: z.enum(['pending', 'done']),
  evidence: z.array(z.string()).optional(),
})

const EpicStub = z.strictObject({
  slug: KebabSlug,
  goal: z.string().optional(),
  status: z.enum(stubStatusValues),
  depends_on: z.array(KebabSlug).optional(),
  acceptance_criteria: z.array(AcceptanceCriterion).optional(),
})

export const ProjectNodeSchema = z.strictObject({
  schema_version: z.number().int(),
  slug: KebabSlug,
  title: z.string(),
  status: ProjectStatus,
  created: z.string().optional(),
  goal: z.string().optional(),
  context: ContextTrails.optional(),
  acceptance: z.array(AcceptanceItem).optional(),
  questions: z.array(QuestionSchema).optional(),
  concerns: z.array(QuestionSchema).optional(),
  epics: z.array(EpicStub).optional(),
  log: z.array(LogEntrySchema).optional(),
})

export type ProjectNode = z.infer<typeof ProjectNodeSchema>
