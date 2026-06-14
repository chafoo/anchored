// modules/phase/phase.ts — the phase (leaf) tier module: a PURE condition bundle.
// It owns the phase node schema + the bundle the orchestrator injects into the
// generic store. phase is the leaf — childTier undefined, no child relationship.
// Imports only lib + the shared schema base; performs no I/O.
import { z } from 'zod'
import { phaseStatusValues, phaseExecutorValues } from '../../lib/constants/statuses.js'
import { phaseTransitions } from '../../lib/constants/transitions.js'
import type { TierCondition } from '../../lib/contracts/tier.js'
import { KebabSlug, AcceptanceCriterion, Rule } from '../shared/schema.js'

export { phaseStatusValues, phaseExecutorValues, KebabSlug, AcceptanceCriterion }
export const PhaseStatus = z.enum(phaseStatusValues)

// reserved executor field (workflow-mode): optional on the wire, NO injected
// default — a phase without executor round-trips byte-identical.
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
  executor: PhaseExecutor.optional(),
})

export type PhaseNode = z.infer<typeof PhaseNodeSchema>

export const phase: TierCondition = {
  tier: 'phase',
  schema: PhaseNodeSchema,
  statusValues: phaseStatusValues,
  transitions: phaseTransitions,
  defaultStatus: 'pending',
  childTier: undefined,
}
