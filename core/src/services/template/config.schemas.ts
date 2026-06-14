// _v3/services/template/config.schemas.ts — what a valid anchored.yml is (Zod). Fractal:
// top-level phase/task/epic/project blocks (+ the _lib alias bucket), each with the four
// stages + a `fields` data-shape. A STEP carries its worker INLINE (the v3 change — no
// worker-dispatch code). The schema validates to the contract `Step` type.
import { z } from 'zod'
import type { Step } from '../../lib/contracts/template.js'

export const tierNames = ['phase', 'task', 'epic', 'project'] as const
export type TierName = (typeof tierNames)[number]
export const TierNameSchema = z.enum(tierNames)

const StepType = z.enum(['agent', 'skill'])
const InvolveLevel = z.enum(['all', 'high-only', 'none'])

// A step is a built-in reference (bare name, or name + inline worker), a run step, or a
// walk step. The XOR keeps a step from being both a privileged worker AND a `run` (a user
// override that smuggled `run` onto the `implement` slot would run arbitrary shell).
export const StepSchema: z.ZodType<Step> = z
  .strictObject({
    name: z.string().min(1),
    worker: z.string().optional(),
    type: StepType.optional(),
    run: z.string().optional(),
    involve: InvolveLevel.optional(),
    before: z.string().optional(),
    after: z.string().optional(),
    instructions: z.string().optional(),
  })
  .refine((s) => !(s.run !== undefined && s.worker !== undefined), {
    error: 'a step has at most one of worker | run',
  })
  .refine((s) => s.type === undefined || s.worker !== undefined, {
    error: 'type (agent|skill) is only valid on a worker step',
  })
  .refine((s) => s.involve === undefined || s.name === 'walk', {
    error: 'involve is only valid on a walk step',
  })
  .refine((s) => !(s.before !== undefined && s.after !== undefined), {
    error: 'a step sets at most one of before | after',
  }) as z.ZodType<Step>

const StepList = z.array(StepSchema)
const Stage = z.strictObject({ steps: StepList.optional() })

// build additionally carries the fractal loop edge (each) + stop/retry_limit (bounded so a
// config can't request a runaway loop).
const BuildStage = z.strictObject({
  steps: StepList.optional(),
  each: TierNameSchema.optional(),
  stop: z.array(z.string()).optional(),
  retry_limit: z.number().int().min(1).max(20).optional(),
  mode: z.enum(['sequential', 'workflow']).optional(),
})

// fields = the data-model shape per tier (policy). Values are descriptive type-strings in
// the default template (e.g. "pending | done"), so stay loose.
const FieldsBlock = z.record(z.string(), z.unknown())

const TierBlock = z.strictObject({
  plan: Stage.optional(),
  refine: Stage.optional(),
  build: BuildStage.optional(),
  wrap: Stage.optional(),
  fields: FieldsBlock.optional(),
})

export const ConfigSchema = z.strictObject({
  phase: TierBlock.optional(),
  task: TierBlock.optional(),
  epic: TierBlock.optional(),
  project: TierBlock.optional(),
  _lib: z.unknown().optional(),
})

export type Config = z.infer<typeof ConfigSchema>
