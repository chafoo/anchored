// _v3/modules/task/task.schemas.ts — the task node schema. childTier = phase: a task file
// EMBEDS full phases (task.phases[]). Slug may be flat (`my-task`) or nested under an epic
// (`my-epic/my-task`). Imports the phase schema (strict downward containment — a task
// CONTAINS phases) + the shared fragments.
import { z } from 'zod'
import { lifecycleStatusValues } from '../shared/statuses.js'
import {
  NestedSlug,
  QuestionSchema,
  LogEntrySchema,
  ContextTrails,
  StepReceipt,
} from '../shared/fragments.schemas.js'
import { PhaseNodeSchema } from '../phase/phase.schemas.js'

export const TaskStatus = z.enum(lifecycleStatusValues)

export const TaskNodeSchema = z.strictObject({
  schema_version: z.number().int(),
  slug: NestedSlug,
  title: z.string(),
  created: z.string().optional(),
  status: TaskStatus,
  context: ContextTrails.optional(),
  questions: z.array(QuestionSchema).optional(),
  // "check at the end" threads raised during build — done blocks while any is open.
  concerns: z.array(QuestionSchema).optional(),
  log: z.array(LogEntrySchema).optional(),
  // step ENFORCEMENT: one receipt per executed (or documented-skipped) template step; the
  // stage-closing status transition requires completeness (shared/receipts.ts guard).
  steps_run: z.array(StepReceipt).optional(),
  phases: z.array(PhaseNodeSchema).optional(),
})

export type TaskNode = z.infer<typeof TaskNodeSchema>
