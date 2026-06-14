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

const AcStatus = z.enum(['pending', 'done', 'deferred'])

const isReasonFilled = (reason: unknown): boolean =>
  typeof reason === 'string' && reason.trim() !== ''

// Acceptance criterion — THE universal substrate invariants live here as `.refine`s, defined
// once and reused by every tier schema. Because the store runs `schema.parse` on every write,
// they are unskippable (the store never learns what evidence or a reason is):
//   • a `done` AC must carry non-empty evidence (the evidence-honesty floor);
//   • a `deferred` AC must carry a non-empty reason (a deferral is documented, never silent).
// The completion floors then treat `done` + `deferred` as terminal and block only `pending`.
export const AcceptanceCriterion = z
  .strictObject({
    id: z.string(),
    text: z.string(),
    status: AcStatus,
    evidence: z.array(z.string()).optional(),
    failures: z.array(z.string()).optional(),
    reason: z.string().optional(),
  })
  .refine((ac) => ac.status !== 'done' || isEvidenceFilled(ac.evidence), {
    error: "an acceptance criterion with status 'done' must have non-empty evidence",
  })
  .refine((ac) => ac.status !== 'deferred' || isReasonFilled(ac.reason), {
    error: "an acceptance criterion with status 'deferred' must have a non-empty reason",
  })

// The epic/project DEFINITION-OF-DONE item — the parent's own outcome list (not a child's).
// Same three-state terminal model + the same two invariants as an AC: `done` ⇒ delivery
// evidence (the roll-up provenance), `deferred` ⇒ a documented reason. Defined once, reused by
// both the epic and the project node schema (it carries no `failures` — a DoD item is not
// gate-rejected, it is delivered, deferred, or pending).
export const AcceptanceItem = z
  .strictObject({
    id: z.string(),
    text: z.string(),
    status: AcStatus,
    evidence: z.array(z.string()).optional(),
    reason: z.string().optional(),
  })
  .refine((a) => a.status !== 'done' || isEvidenceFilled(a.evidence), {
    error: "a definition-of-done item with status 'done' must have non-empty delivery evidence",
  })
  .refine((a) => a.status !== 'deferred' || isReasonFilled(a.reason), {
    error: "a definition-of-done item with status 'deferred' must have a non-empty reason",
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
