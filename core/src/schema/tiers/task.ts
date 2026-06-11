// schema/tiers/task.ts — the task tier descriptor. childTier = 'phase'. Slug may
// be flat (`my-task`) or nested under an epic (`my-epic/my-task`).
import { z } from 'zod'
import { PhaseNodeSchema } from './phase.js'

export const taskStatusValues = ['plan', 'drafted', 'refined', 'build', 'wrap', 'done'] as const
export const TaskStatus = z.enum(taskStatusValues)

export const NestedSlug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/, {
    error: 'must be a kebab slug, optionally nested as <epic>/<slug>',
  })

export const QuestionSchema = z.strictObject({
  id: z.string(),
  text: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  origin: z.string().optional(),
  status: z.enum(['open', 'resolved']),
  answer: z.string().optional(),
  source: z.enum(['user', 'ai']).optional(),
  reasoning: z.string().optional(),
  phase: z.string().optional(),
})

export const LogEntrySchema = z.strictObject({
  at: z.string(),
  kind: z.string(),
  note: z.string(),
})

export const ContextTrails = z.strictObject({
  plan: z.string().optional(),
  refine: z.string().optional(),
  build: z.string().optional(),
  wrap: z.string().optional(),
})

export const TaskNodeSchema = z.strictObject({
  schema_version: z.number().int(),
  slug: NestedSlug,
  title: z.string(),
  created: z.string().optional(),
  status: TaskStatus,
  context: ContextTrails.optional(),
  questions: z.array(QuestionSchema).optional(),
  log: z.array(LogEntrySchema).optional(),
  phases: z.array(PhaseNodeSchema).optional(),
})

export type TaskNode = z.infer<typeof TaskNodeSchema>

export const taskDescriptor = {
  tier: 'task',
  statusEnum: taskStatusValues,
  childTier: 'phase',
  schema: TaskNodeSchema,
} as const
