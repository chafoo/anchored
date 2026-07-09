// modules/run/run.schemas.ts — the run-file schema + its z.infer types. THE mechanism:
// the evidence invariant lives here as refinements, and because the store parses every
// write fail-closed against this schema, the invariant is unskippable — no verb, no bug,
// no caller can persist `done` without validator-authored evidence. What COUNTS as
// evidence (executed output vs. reasoned inspection) is deliberately not decided here:
// that is the user's policy, stacked per setup. See `validator.require` in the config.
//
// The schema is BUILT from config: top-level custom `fields` (anchored.yml) become
// optional, typed criterion properties — so `buildRunSchema(config.fields())` is the one
// law the store is handed.
import { z } from 'zod'
import type { FieldsConfig } from '../../lib/contracts/config.js'
import { anchoredError } from '../../lib/utils/error.js'

export const RIGOR_LEVELS = ['light', 'standard', 'high', 'max'] as const

export const CRITERION_STATUSES = ['open', 'done', 'failed', 'superseded', 'rejected'] as const

/** statuses that still count toward the close gate (superseded/rejected do not). */
export const ACTIVE_STATUSES = ['open', 'done', 'failed'] as const

export const EvidenceSchema = z
  .object({
    by: z.literal('validator'), // only the validator authors proof — schema-pinned
    snapshot: z.string().min(1), // the pinned state this proof refers to (opaque to core)
    grounded: z.string().min(1).optional(), // executed-command proof (preferred)
    verdict: z.string().min(1).optional(), // prose judgment / reasoned rejection
    at: z.iso.datetime(),
  })
  .strict()
  .refine((e) => e.grounded !== undefined || e.verdict !== undefined, {
    message: 'evidence carries executed command output (grounded) or a verdict',
  })

export const AmendmentSchema = z
  .object({
    id: z.string().regex(/^a\d+$/),
    at: z.iso.datetime(),
    reason: z.string().min(1),
  })
  .strict()

export const TrailEntrySchema = z
  .object({
    at: z.iso.datetime(),
    claim: z.string().min(1).optional(),
    refs: z.array(z.string()).optional(), // optional criterion hints — free-form, never gates
    gate: z.string().optional(),
    validated: z.string().optional(), // validation requests are trail entries too
    snapshot: z.string().min(1).optional(), // the token handed out — lets validate dedupe
  })
  .strict()
  .refine((t) => t.claim !== undefined || t.validated !== undefined, {
    message: 'a trail entry is a claim or a validation record',
  })

const CRITERION_BASE = {
  id: z.string().regex(/^c\d+$/),
  text: z.string().min(1),
  setup: z.string().optional(), // which setup verifies it; no setup → defaults
  gate: z.string().optional(), // the AI's slicing; absent → the single final gate
  /** declared at anchor/amend time: nothing can be EXECUTED against this criterion, it is
   *  verified by inspection (copy quality, pattern fidelity, an asset looking right). A
   *  note for the reader — and the exemption that survives a `require: grounded` setup. */
  judgment: z.boolean().optional(),
  status: z.enum(CRITERION_STATUSES).default('open'),
  evidence: EvidenceSchema.optional(),
  superseded_by: z.string().optional(),
  amended_by: z.string().optional(),
  added_by: z.string().optional(),
} as const

function customShapes(fields: FieldsConfig) {
  const shape: Record<string, z.ZodType> = {}
  for (const [name, kind] of Object.entries(fields)) {
    if (name in CRITERION_BASE)
      throw anchoredError(
        'ReservedField',
        `custom field '${name}' collides with a built-in criterion key`,
        [`rename the field in anchored.yml (reserved: ${Object.keys(CRITERION_BASE).join(', ')})`],
      )
    const base = kind === 'string' ? z.string() : kind === 'number' ? z.number() : z.boolean()
    shape[name] = base.optional()
  }
  return shape
}

export function buildCriterionSchema(fields: FieldsConfig) {
  return z
    .object({ ...CRITERION_BASE, ...customShapes(fields) })
    .strict()
    .superRefine((c, ctx) => {
      // ───── THE EVIDENCE INVARIANT ─────
      if (c.status === 'done' && c.evidence === undefined)
        ctx.addIssue({
          code: 'custom',
          message: `criterion ${c.id}: done requires validator evidence`,
        })
      // NOTE: the schema does NOT demand `grounded` for done. Executing something is a
      // METHOD of proof, not the nature of it — an asset, a copy deck, a design token are
      // verified by inspection, and that is evidence too. Whether a setup refuses prose is
      // POLICY (`validator.require: grounded`), checked by the `evidence` verb.
      if (c.status === 'failed' && c.evidence?.verdict === undefined)
        ctx.addIssue({
          code: 'custom',
          message: `criterion ${c.id}: failed requires a reasoned verdict`,
        })
      if (c.status === 'open' && c.evidence !== undefined)
        ctx.addIssue({
          code: 'custom',
          message: `criterion ${c.id}: open must not carry evidence`,
        })
      if (c.status === 'superseded' && c.superseded_by === undefined)
        ctx.addIssue({
          code: 'custom',
          message: `criterion ${c.id}: superseded requires superseded_by`,
        })
    })
}

export function buildRunSchema(fields: FieldsConfig) {
  return z
    .object({
      goal: z.string().min(1),
      rigor: z.enum(RIGOR_LEVELS).default('standard'),
      plan: z.string().optional(), // verbatim — immutability is enforced by the verbs
      amendments: z.array(AmendmentSchema).default([]),
      criteria: z.array(buildCriterionSchema(fields)).min(1),
      trail: z.array(TrailEntrySchema).default([]),
      closed: z.object({ at: z.iso.datetime() }).strict().optional(),
    })
    .strict()
    .superRefine((run, ctx) => {
      const criterionIds = new Set<string>()
      for (const c of run.criteria) {
        if (criterionIds.has(c.id))
          ctx.addIssue({ code: 'custom', message: `duplicate criterion id ${c.id}` })
        criterionIds.add(c.id)
      }
      const amendmentIds = new Set<string>()
      for (const a of run.amendments) {
        if (amendmentIds.has(a.id))
          ctx.addIssue({ code: 'custom', message: `duplicate amendment id ${a.id}` })
        amendmentIds.add(a.id)
      }
      for (const c of run.criteria) {
        if (c.superseded_by !== undefined && !criterionIds.has(c.superseded_by))
          ctx.addIssue({
            code: 'custom',
            message: `criterion ${c.id}: superseded_by ${c.superseded_by} does not resolve`,
          })
        for (const ref of [c.amended_by, c.added_by])
          if (ref !== undefined && !amendmentIds.has(ref))
            ctx.addIssue({
              code: 'custom',
              message: `criterion ${c.id}: amendment ${ref} does not resolve`,
            })
      }
      // ───── THE CLOSE GATE (schema backstop; the verb pre-checks with a friendly list) ─────
      if (run.closed !== undefined)
        for (const c of run.criteria)
          if ((ACTIVE_STATUSES as readonly string[]).includes(c.status) && c.status !== 'done')
            ctx.addIssue({
              code: 'custom',
              message: `closed run has unproven active criterion ${c.id} (${c.status})`,
            })
    })
}

/** The base (no custom fields) schema — the canonical type source. */
export const RunSchema = buildRunSchema({})

export type Evidence = z.output<typeof EvidenceSchema>
export type Amendment = z.output<typeof AmendmentSchema>
export type TrailEntry = z.output<typeof TrailEntrySchema>
export type Criterion = z.output<ReturnType<typeof buildCriterionSchema>>
export type RunFile = z.output<typeof RunSchema>
export type Rigor = (typeof RIGOR_LEVELS)[number]
export type CriterionStatus = (typeof CRITERION_STATUSES)[number]
