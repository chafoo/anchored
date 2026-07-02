// _v3/modules/phase/phase.schemas.ts — the phase (leaf) node schema. A phase has no own
// file: it lives embedded in its task file (task.phases[]). Composed from the shared
// fragments; carries the evidence-refine via AcceptanceCriterion. The task schema embeds it.
import { z } from 'zod'
import { phaseStatusValues } from '../shared/statuses.js'
import { KebabSlug, Rule, AcceptanceCriterion, StepReceipt } from '../shared/fragments.schemas.js'

export const PhaseStatus = z.enum(phaseStatusValues)

export const PhaseNodeSchema = z.strictObject({
  name: z.string(),
  slug: KebabSlug,
  status: PhaseStatus,
  context: z.string().optional(),
  rules: z.array(Rule).optional(),
  acceptance_criteria: z.array(AcceptanceCriterion).optional(),
  evidence: z.array(z.string()).optional(),
  failures: z.array(z.string()).optional(),
  // A phase is a sequential leaf (no own `execute` — that fan-out axis moved up to the build
  // loop). depends_on: other phase slugs that must finish first — plan/refine sets it;
  // `phase ready` honours it so independent phases can build in parallel (multi-phase fan-out).
  depends_on: z.array(KebabSlug).optional(),
  // step ENFORCEMENT for the leaf pipeline: one receipt per executed phase.build step;
  // `phase status done` requires completeness (shared/receipts.ts guard).
  steps_run: z.array(StepReceipt).optional(),
})

export type PhaseNode = z.infer<typeof PhaseNodeSchema>
