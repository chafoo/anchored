// schema/config.ts — the anchored.yml schema (Zod), fractal: top-level blocks
// phase/task/epic (project reserved, same form). Each tier has plan/refine/build/
// wrap; only build may carry `each` + stop + retry_limit. `fields` is the policy
// data-shape and stays loose (the schema knows no concrete step NAMES).
import { z } from 'zod'
import { StepSchema, TierName, safeParseWith, type SafeResult } from '../../../domain/steps/step.js'

const StepList = z.array(StepSchema)

// plan / refine / wrap: just a steps list
const Stage = z.strictObject({ steps: StepList.optional() })

// build: steps + the fractal loop edge (each) + stop + retry_limit
const BuildStage = z.strictObject({
  steps: StepList.optional(),
  each: TierName.optional(),
  stop: z.array(z.string()).optional(),
  // Q4 (harden-1): upper-bounded so a config can't request a runaway loop (1e9
  // retries → effective hang/DoS). 20 is far above any real retry need.
  retry_limit: z.number().int().min(1).max(20).optional(),
  mode: z.enum(['sequential', 'workflow']).optional(),
})

// fields = the data-model shape per tier (policy). Values are descriptive
// type-strings in the default template (e.g. "pending | done"), so stay loose.
const FieldsBlock = z.record(z.string(), z.unknown())

const TierBlock = z.strictObject({
  plan: Stage.optional(),
  refine: Stage.optional(),
  build: BuildStage.optional(),
  wrap: Stage.optional(),
  fields: FieldsBlock.optional(),
})

// Top-level: only the tier blocks + the `_lib` alias bucket. `.strict` rejects
// any other top-level key. (_lib is where YAML anchors live in the anchored.yml
// profile — alias expansion itself is the parser's job.)
export const ConfigSchema = z.strictObject({
  phase: TierBlock.optional(),
  task: TierBlock.optional(),
  epic: TierBlock.optional(),
  project: TierBlock.optional(),
  _lib: z.unknown().optional(),
})

export type Config = z.infer<typeof ConfigSchema>

export function parseConfig(input: unknown): Config {
  return ConfigSchema.parse(input)
}

export function safeParseConfig(input: unknown): SafeResult<Config> {
  return safeParseWith(ConfigSchema, input)
}
