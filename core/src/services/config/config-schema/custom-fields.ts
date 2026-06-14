// schema/custom-fields.ts — thread config-declared custom fields into a tier's
// node schema. The base tier schemas (task/epic/phase) are strict — they reject
// any key they don't know. That is correct for the mechanism (no typo slips
// through), but it also blocked a *declared* custom field: a user who writes
//
//   task:
//     fields:
//       commit_sha: string        # declare a custom field on the task-file
//
// in anchored.yml could not `set-field commit_sha …` — persist rejected the
// unknown key. This helper extends the base schema with exactly the declared
// fields that aren't already part of it, so a declared custom field validates
// (read + write) while every KNOWN field keeps its strict, typed check.
import { z } from 'zod'

// the `fields` values are descriptive type-strings (e.g. "string", "int",
// "pending | done", "markdown", "list<…>"). Map the simple scalars to a real
// zod check; anything richer falls back to `unknown` (permissive but persisted).
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
    // Q4 (harden-1): a pipe-union of literals (`a | b | c`) → a real enum, so a
    // declared status-like custom field rejects an off-enum value instead of
    // accepting anything. Anything richer (list<…>, view<…>) keeps the permissive
    // `unknown` fallback — a hard fail here would break the default template's own
    // non-scalar field declarations (decisions: view<…>, evidence: list<…>).
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

/** Extend a base tier node-schema with any config-declared custom fields that are
 *  not already part of the base shape. Returns the base unchanged when there is
 *  nothing custom to add (so the strict default path is untouched). */
export function extendSchemaWithFields(
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
