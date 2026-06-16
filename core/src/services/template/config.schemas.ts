// _v3/services/template/config.schemas.ts — what a valid anchored.yml is (Zod). Fractal:
// top-level phase/task/epic/project blocks (+ the _lib alias bucket), each with the four
// stages + a `fields` data-shape. A STEP carries its worker INLINE (the v3 change — no
// worker-dispatch code). The schema validates to the contract `Step` type.
import { z } from 'zod'
import type { Step } from '../../lib/contracts/template.js'

export const tierNames = ['phase', 'task', 'epic'] as const
export type TierName = (typeof tierNames)[number]
export const TierNameSchema = z.enum(tierNames)

const StepType = z.enum(['agent', 'skill'])
const InvolveLevel = z.enum(['all', 'high-only', 'none'])
const Execute = z.enum(['sequential', 'workflow'])
const StepUseSchema = z.strictObject({ type: StepType, name: z.string().min(1) })

// A step (requirements-3): prose for the main thread (`instructions`), an optional worker
// (`use: {type, name}`), an optional fan-out mode (`execute`). No `run` (a command goes in
// prose, never an enforced shell), no bare `worker`/`type` (folded into `use`). `involve` is
// the walk-only q&a knob; `before`/`after`/`with` are the three positioners — `before`/`after`
// anchor a step sequentially, `with` runs it in a named step's parallel batch (the batch joins
// before the next sequential step). All three share the "relative to a named anchor" idiom and
// are mutually exclusive (a step picks at most one positioner).
export const StepSchema: z.ZodType<Step> = z
  .strictObject({
    name: z.string().min(1),
    instructions: z.string().optional(),
    use: StepUseSchema.optional(),
    execute: Execute.optional(),
    involve: InvolveLevel.optional(),
    before: z.string().optional(),
    after: z.string().optional(),
    with: z.string().optional(),
  })
  .refine((s) => s.involve === undefined || s.name === 'walk', {
    error: 'involve is only valid on a walk step',
  })
  .refine((s) => [s.before, s.after, s.with].filter((v) => v !== undefined).length <= 1, {
    error: 'a step sets at most one positioner of before | after | with',
  }) as z.ZodType<Step>

const StepList = z.array(StepSchema)
const Stage = z.strictObject({ steps: StepList.optional() })

// build additionally carries the fractal loop edge (each) + stop/retry_limit. There is NO
// loop-parallelism flag here — whether the children run sequentially or several at once is
// plugin orchestration via depends_on (requirements-3), not config. `execute` lives on a step.
const BuildStage = z.strictObject({
  steps: StepList.optional(),
  each: TierNameSchema.optional(),
  stop: z.array(z.string()).optional(),
  retry_limit: z.number().int().min(1).max(20).optional(),
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
  _lib: z.unknown().optional(),
})

export type Config = z.infer<typeof ConfigSchema>
