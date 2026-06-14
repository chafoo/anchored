// _v3/modules/shared/fragments.schemas.ts — the cross-tier zod FRAGMENTS the tier modules
// compose their node schemas from (slugs · the AC shape with the evidence refine · question ·
// log · context trails). The modules' shared base; imports only the shared evidence predicate
// (+ the zod runtime). Holds NO tier identity — just the reusable building blocks.
import { z } from 'zod'
import { isEvidenceFilled } from './evidence.js'

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

// Acceptance criterion — THE universal evidence invariant lives here as a `.refine`: a `done`
// AC must carry non-empty evidence. Defined once, reused by every tier schema; because the
// store runs `schema.parse` on every write, the rule is unskippable (the store never learns
// what evidence is).
export const AcceptanceCriterion = z
  .strictObject({
    id: z.string(),
    text: z.string(),
    status: AcStatus,
    evidence: z.array(z.string()).optional(),
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
