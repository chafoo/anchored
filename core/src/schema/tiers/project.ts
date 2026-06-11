// schema/tiers/project.ts — RESERVED descriptor, same fractal form (childTier =
// 'epic'). Not exercised by any active code path in this epic (q4: epic first).
// Kept so the schema accepts the shape; an executor comes later.
import { z } from 'zod'
import { KebabSlug } from './phase.js'
import { QuestionSchema, LogEntrySchema } from './task.js'

export const projectStatusValues = ['planning', 'building', 'done'] as const
export const ProjectStatus = z.enum(projectStatusValues)

const AcceptanceItem = z.strictObject({
  id: z.string(),
  text: z.string(),
  status: z.enum(['pending', 'done']),
})

const EpicStub = z.strictObject({
  slug: KebabSlug,
  goal: z.string(),
  status: z.enum(['pending', 'active', 'done', 'blocked']),
  depends_on: z.array(KebabSlug).optional(),
})

export const ProjectNodeSchema = z.strictObject({
  schema_version: z.number().int(),
  slug: KebabSlug,
  title: z.string(),
  status: ProjectStatus,
  goal: z.string().optional(),
  acceptance: z.array(AcceptanceItem).optional(),
  questions: z.array(QuestionSchema).optional(),
  epics: z.array(EpicStub).optional(),
  log: z.array(LogEntrySchema).optional(),
})

export type ProjectNode = z.infer<typeof ProjectNodeSchema>

export const projectDescriptor = {
  tier: 'project',
  statusEnum: projectStatusValues,
  childTier: 'epic',
  schema: ProjectNodeSchema,
} as const
