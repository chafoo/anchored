// schema/step.ts — the step grammar (Zod). Pure data schemas + parse helpers,
// no module-level side effects (the allowed "pure data / Zod" exception of the
// factory-functions rule). Reserved built-in step NAMES are policy and live in
// resolve-steps — this file is only the structural grammar.
import { z } from 'zod'

export type SafeResult<T> = { ok: true; value: T } | { ok: false; error: z.ZodError }

export function safeParseWith<T>(schema: z.ZodType<T>, input: unknown): SafeResult<T> {
  const r = schema.safeParse(input)
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error }
}

export const tierNames = ['phase', 'task', 'epic', 'project'] as const
export type TierName = (typeof tierNames)[number]
export const TierName = z.enum(tierNames)

export const StepType = z.enum(['agent', 'skill'])
export const InvolveLevel = z.enum(['all', 'high-only', 'none'])

export interface Step {
  name: string
  run?: string
  use?: string
  type?: z.infer<typeof StepType>
  instructions?: string
  involve?: z.infer<typeof InvolveLevel>
  before?: string
  after?: string
  each?: TierName
  steps?: Step[]
  provenance?: { field: string; ref?: string }
  after_done?: boolean
}

// A step is one of: a bare built-in reference (name only), a run step, a use
// step, or a loop step (each + optional body). The XOR is "at most one of
// run|use|each" — a bare `{ name: implement }` is a valid built-in reference
// (the default template is full of them).
export const StepSchema: z.ZodType<Step> = z.lazy(() =>
  z
    .strictObject({
      name: z.string().min(1),
      run: z.string().optional(),
      use: z.string().optional(),
      type: StepType.optional(),
      instructions: z.string().optional(),
      involve: InvolveLevel.optional(),
      before: z.string().optional(),
      after: z.string().optional(),
      each: TierName.optional(),
      steps: z.array(StepSchema).optional(),
      // provenance: after a run-step succeeds the engine captures `git rev-parse
      // <ref|HEAD>` and writes the SHA into `field` (mechanism). field = which
      // task-file field receives it; ref optional, defaults to HEAD at use-site.
      provenance: z
        .strictObject({ field: z.string().min(1), ref: z.string().optional() })
        .optional(),
      // after_done: a marker on a pure-recorder run-step (e.g. commit-audit-trail).
      // The wrap SKILL runs such steps AFTER the done-flip so they capture the
      // terminal `status: done` and leave a clean tree (policy, not mechanism).
      after_done: z.boolean().optional(),
    })
    .refine(
      (s) =>
        (s.run !== undefined ? 1 : 0) +
          (s.use !== undefined ? 1 : 0) +
          (s.each !== undefined ? 1 : 0) <=
        1,
      { error: 'a step has at most one of run | use | each (a bare name is a built-in reference)' },
    )
    .refine((s) => s.type === undefined || s.use !== undefined, {
      error: 'type (agent|skill) is only valid on a use-step',
    })
    .refine((s) => s.involve === undefined || s.name === 'walk', {
      error: 'involve is only valid on a walk-step',
    })
    .refine((s) => s.steps === undefined || s.each !== undefined, {
      error: 'a steps body is only valid on a loop step (each)',
    })
    .refine((s) => !(s.before !== undefined && s.after !== undefined), {
      error: 'a step sets at most one of before | after',
    })
    .refine((s) => s.provenance === undefined || s.run !== undefined, {
      error: 'provenance is only valid on a run-step (it captures the SHA the run produced)',
    })
    .refine((s) => s.after_done === undefined || s.run !== undefined, {
      error:
        'after_done is only valid on a run-step (a pure-recorder step run after the done-flip)',
    }),
)

export function parseStep(input: unknown): Step {
  return StepSchema.parse(input)
}

export function safeParseStep(input: unknown): SafeResult<Step> {
  return safeParseWith(StepSchema, input)
}
