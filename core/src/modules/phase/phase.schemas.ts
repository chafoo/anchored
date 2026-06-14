// _v3/modules/phase/phase.schemas.ts — the phase (leaf) node schema. A phase has no own
// file: it lives embedded in its task file (task.phases[]). Composed from the shared
// fragments; carries the evidence-refine via AcceptanceCriterion. The task schema embeds it.
import { z } from 'zod'
import { phaseStatusValues, phaseExecutorValues } from '../shared/statuses.js'
import { KebabSlug, Rule, AcceptanceCriterion } from '../shared/fragments.schemas.js'

export const PhaseStatus = z.enum(phaseStatusValues)
export const PhaseExecutor = z.enum(phaseExecutorValues)

export const PhaseNodeSchema = z.strictObject({
  name: z.string(),
  slug: KebabSlug,
  status: PhaseStatus,
  context: z.string().optional(),
  rules: z.array(Rule).optional(),
  acceptance_criteria: z.array(AcceptanceCriterion).optional(),
  evidence: z.array(z.string()).optional(),
  failures: z.array(z.string()).optional(),
  // reserved executor (workflow-mode): optional, no injected default (round-trips identical).
  executor: PhaseExecutor.optional(),
})

export type PhaseNode = z.infer<typeof PhaseNodeSchema>
