// services/config/config.schemas.ts — the anchored.yml schema + its z.infer types. Config
// is deliberately tiny: top-level custom `fields` (record `name: type`) + `defaults` +
// named `setups`, every setup EXACTLY { validator, before, after } instruction blocks.
// No extends, no nesting, no step lists — .strict() enforces that structurally.
import { z } from 'zod'

export const InstructionsSchema = z
  .object({
    instructions: z.string().min(1),
  })
  .strict()

/** One setup (and `defaults` shares the shape) — exactly these three slots. */
export const SetupSchema = z
  .object({
    validator: InstructionsSchema.optional(),
    before: InstructionsSchema.optional(),
    after: InstructionsSchema.optional(),
  })
  .strict()

export const FIELD_TYPES = ['string', 'number', 'boolean'] as const

export const AnchoredConfigSchema = z
  .object({
    fields: z.record(z.string(), z.enum(FIELD_TYPES)).default({}),
    defaults: SetupSchema.default({}),
    setups: z.record(z.string(), SetupSchema).default({}),
  })
  .strict()

export type AnchoredConfig = z.output<typeof AnchoredConfigSchema>
export type Setup = z.output<typeof SetupSchema>
