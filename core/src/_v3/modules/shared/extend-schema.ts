// _v3/modules/shared/extend-schema.ts — apply template.fields(tier) to a tier's node schema.
// The module owns its schema; template supplies only the declared-fields DATA, and the module
// calls this to widen its strict schema with exactly the declared custom fields (so a declared
// `task.fields.commit_sha` validates on read+write while every known field stays strict).
import { z } from 'zod'

// the `fields` values are descriptive type-strings ("string", "int", "a | b | c", "list<…>").
// Map simple scalars to a zod check; a pipe-union of literals → a real enum; anything richer
// falls back to `unknown` (permissive but persisted, e.g. list<…>).
const SIMPLE: Record<string, () => z.ZodType> = {
  string: () => z.string(),
  markdown: () => z.string(),
  kebab: () => z.string(),
  date: () => z.string(),
  number: () => z.number(),
  int: () => z.number(),
  boolean: () => z.boolean(),
}

function zodForTypeString(t: unknown): z.ZodType {
  if (typeof t === 'string') {
    const s = t.trim()
    const f = SIMPLE[s.toLowerCase()]
    if (f) return f()
    const parts = s
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length >= 2 && parts.every((p) => /^[\w-]+$/.test(p))) {
      return z.enum(parts as [string, ...string[]])
    }
  }
  return z.unknown()
}

/** Extend a base tier node-schema with any declared custom fields not already in the base.
 *  Returns the base unchanged when there is nothing custom (the strict default path is intact). */
export function extendSchema(
  base: z.ZodObject,
  fields: Record<string, unknown> | undefined,
): z.ZodObject {
  if (!fields) return base
  const known = new Set(Object.keys(base.shape))
  const extra: Record<string, z.ZodType> = {}
  for (const [name, typeStr] of Object.entries(fields)) {
    if (known.has(name)) continue
    extra[name] = zodForTypeString(typeStr).optional()
  }
  return Object.keys(extra).length > 0 ? base.extend(extra) : base
}
