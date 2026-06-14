// modules/shared/schema.ts — the cross-tier schema FRAGMENTS the tier modules
// compose their node schemas from (slugs, the AC shape, questions, log, context
// trails). This is the modules layer's own shared base: it imports only lib (+ the
// zod runtime) and is imported by the tier modules so they need not reach sideways
// into one another. It holds NO tier identity (no node schema, no bundle) — just
// the reusable building blocks.
import { z } from 'zod'
import { isEvidenceFilled } from '../../lib/utils/evidence/evidence.js'

export const KebabSlug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'must be kebab-case (a-z0-9, dash-separated)' })

export const NestedSlug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/, {
    error: 'must be a kebab slug, optionally nested as <epic>/<slug>',
  })

export const Rule = z.strictObject({ path: z.string(), why: z.string() })

const AcStatus = z.enum(['pending', 'done'])

// Acceptance criterion — second line of defence for the invariant: status 'done'
// requires non-empty evidence (mirrors the store guard's isEvidenceFilled).
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
