// schema/tiers/epic.ts — the epic tier descriptor. childTier = 'task'. Holds
// coarse task STUBS (the loop queue) — never phases (those live in task files).
import { z } from 'zod'
import { KebabSlug } from './phase.js'
import { QuestionSchema, LogEntrySchema } from './task.js'

export const epicStatusValues = ['planning', 'building', 'done'] as const
export const EpicStatus = z.enum(epicStatusValues)

const AcceptanceItem = z.strictObject({
  id: z.string(),
  text: z.string(),
  status: z.enum(['pending', 'done']),
})

const TaskStub = z.strictObject({
  slug: KebabSlug,
  // optional so a bare `add-child` stub is valid (rolling-wave: scaffold/set-field
  // fills the goal); a meaningful stub still carries one.
  goal: z.string().optional(),
  status: z.enum(['pending', 'active', 'done', 'blocked']),
  depends_on: z.array(KebabSlug).optional(),
})

export const EpicNodeSchema = z.strictObject({
  schema_version: z.number().int(),
  slug: KebabSlug,
  title: z.string(),
  status: EpicStatus,
  goal: z.string().optional(),
  acceptance: z.array(AcceptanceItem).optional(),
  questions: z.array(QuestionSchema).optional(),
  tasks: z.array(TaskStub).optional(),
  log: z.array(LogEntrySchema).optional(),
})

export type EpicNode = z.infer<typeof EpicNodeSchema>

export const epicDescriptor = {
  tier: 'epic',
  statusEnum: epicStatusValues,
  childTier: 'task',
  schema: EpicNodeSchema,
} as const
