// modules/task/task.ts — the task tier module: a PURE condition bundle. childTier =
// 'phase' (a task file embeds full phases). Slug may be flat (`my-task`) or nested
// under an epic (`my-epic/my-task`). Imports only lib + the shared schema base + the
// phase module's node schema (strict downward containment — a task CONTAINS phases).
import { z } from 'zod'
import {
  lifecycleStatusValues,
  phaseStatusValues,
  phaseExecutorValues,
} from '../../lib/constants/statuses.js'
import { lifecycleTransitions } from '../../lib/constants/transitions.js'
import type { TierCondition } from '../../lib/contracts/tier.js'
import { NestedSlug, QuestionSchema, LogEntrySchema, ContextTrails } from '../shared/schema.js'
import { PhaseNodeSchema } from '../phase/phase.js'

export { NestedSlug, QuestionSchema, LogEntrySchema, ContextTrails }
export const taskStatusValues = lifecycleStatusValues
export const TaskStatus = z.enum(taskStatusValues)

export const TaskNodeSchema = z.strictObject({
  schema_version: z.number().int(),
  slug: NestedSlug,
  title: z.string(),
  created: z.string().optional(),
  status: TaskStatus,
  context: ContextTrails.optional(),
  questions: z.array(QuestionSchema).optional(),
  // harden-3: "check at the end" threads raised during build (a failed gate, a
  // deferred edge, a flagged decision). Same shape as a question; the substrate
  // blocks `done` while any concern is open (resolved in the wrap concern-walk).
  concerns: z.array(QuestionSchema).optional(),
  log: z.array(LogEntrySchema).optional(),
  phases: z.array(PhaseNodeSchema).optional(),
})

export type TaskNode = z.infer<typeof TaskNodeSchema>

export const task: TierCondition = {
  tier: 'task',
  schema: TaskNodeSchema,
  statusValues: taskStatusValues,
  transitions: lifecycleTransitions,
  defaultStatus: 'plan',
  childTier: 'phase',
  childField: 'phases',
  childStatusValues: phaseStatusValues,
  // a phase may be consciously deferred (doesn't block the task's done); pending/
  // in-progress/blocked keep it open.
  childTerminalOk: ['done', 'deferred'],
  childExecutorValues: phaseExecutorValues,
}
