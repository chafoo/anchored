// modules/project/project.ts — the project tier module: a PURE condition bundle.
// childTier = 'epic'. Same fractal form as every other non-leaf tier — it walks the
// uniform plan→done lifecycle and carries epic STUBS as its loop-queue (mirroring
// epic's task-stubs). Imports only lib + the shared schema base.
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

// D1 (project): mirrors the task/epic lifecycle EXACTLY — uniform stage-transitions
// on every tier (no tier-branching). The old reduced planning/building/done is gone.
export const projectStatusValues = lifecycleStatusValues
export const ProjectStatus = z.enum(projectStatusValues)

const AcceptanceItem = z.strictObject({
  id: z.string(),
  text: z.string(),
  status: z.enum(['pending', 'done']),
  // M3: the project DoD item carries delivery evidence — same evidence-honesty floor
  // as epic, one tier up. Required before the item flips done.
  evidence: z.array(z.string()).optional(),
})

const EpicStub = z.strictObject({
  slug: KebabSlug,
  // optional so a bare `add-child` stub is valid (rolling-wave fills the goal).
  goal: z.string().optional(),
  status: z.enum(stubStatusValues),
  depends_on: z.array(KebabSlug).optional(),
  // D2: outcome-level epic-ACs project-refine works out per stub — same AC shape as
  // a phase, so every generic child-AC op works on an epic-stub unchanged.
  acceptance_criteria: z.array(AcceptanceCriterion).optional(),
})

export const ProjectNodeSchema = z.strictObject({
  schema_version: z.number().int(),
  slug: KebabSlug,
  title: z.string(),
  status: ProjectStatus,
  created: z.string().optional(),
  goal: z.string().optional(),
  // D1: project carries the same context trails as task/epic (plan/refine/build/wrap).
  context: ContextTrails.optional(),
  acceptance: z.array(AcceptanceItem).optional(),
  questions: z.array(QuestionSchema).optional(),
  // harden-3: "check at the end" threads — done blocks while open.
  concerns: z.array(QuestionSchema).optional(),
  epics: z.array(EpicStub).optional(),
  log: z.array(LogEntrySchema).optional(),
})

export type ProjectNode = z.infer<typeof ProjectNodeSchema>

export const project: TierCondition = {
  tier: 'project',
  schema: ProjectNodeSchema,
  statusValues: projectStatusValues,
  transitions: lifecycleTransitions,
  defaultStatus: 'plan',
  childTier: 'epic',
  childField: 'epics',
  childStatusValues: stubStatusValues,
  childTerminalOk: ['done'],
}
