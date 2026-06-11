// schema/tiers/phase.ts — the phase tier descriptor: config-driven FIELDS + fixed
// MECHANICS (status enum, childTier=Leaf). phase is the leaf — no child tier.
import { z } from 'zod'
import { isEvidenceFilled } from '../../state/invariants.js'

export const phaseStatusValues = ['pending', 'in-progress', 'done', 'blocked', 'deferred'] as const
export const PhaseStatus = z.enum(phaseStatusValues)

// reserved executor field (workflow-mode): optional on the wire, NO injected
// default — a phase without executor round-trips byte-identical.
export const phaseExecutorValues = ['implement', 'workflow'] as const
export const PhaseExecutor = z.enum(phaseExecutorValues)

export const KebabSlug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'must be kebab-case (a-z0-9, dash-separated)' })

const AcStatus = z.enum(['pending', 'done'])

const Rule = z.strictObject({ path: z.string(), why: z.string() })

// Acceptance criterion — second line of defence for the invariant: status 'done'
// requires non-empty evidence (mirrors state/invariants.isEvidenceFilled).
export const AcceptanceCriterion = z
  .strictObject({
    id: z.string(),
    text: z.string(),
    status: AcStatus,
    evidence: z.array(z.string()).optional(),
    // gate-rejection log for the failures-driven re-do loop (setChildFailures):
    // a gate writes why an AC was rejected and flips it back to pending.
    failures: z.array(z.string()).optional(),
  })
  .refine((ac) => ac.status !== 'done' || isEvidenceFilled(ac.evidence), {
    error: "an acceptance criterion with status 'done' must have non-empty evidence",
  })

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

export const phaseDescriptor = {
  tier: 'phase',
  statusEnum: phaseStatusValues,
  childTier: undefined,
  schema: PhaseNodeSchema,
} as const
