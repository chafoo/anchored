// schema/tiers/epic.ts — the epic tier descriptor. childTier = 'task'. Holds
// coarse task STUBS (the loop queue) — never phases (those live in task files).
import { z } from 'zod'
import { KebabSlug } from './phase.js'
import { QuestionSchema, LogEntrySchema, ContextTrails } from './task.js'

// D1: the epic tier mirrors the task lifecycle EXACTLY — same words, same forward
// edges — so plan/refine/build/wrap run uniform stage-transitions on every tier
// (no tier-branching in the skills). The old reduced planning/building/done is gone.
export const epicStatusValues = ['plan', 'drafted', 'refined', 'build', 'wrap', 'done'] as const
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
  created: z.string().optional(),
  goal: z.string().optional(),
  // D1: epic carries the same context trails as task (plan/refine/build/wrap prose).
  context: ContextTrails.optional(),
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
