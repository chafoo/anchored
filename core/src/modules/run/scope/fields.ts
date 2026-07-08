// modules/run/scope/fields.ts — `set` value coercion for the declared custom fields.
// The CLI hands every value as a string; the declared type (anchored.yml `fields`) decides
// how it lands in the run file. Undeclared field = loud error (the strict schema would
// reject it anyway — this one is friendlier and earlier).
import type { FieldsConfig } from '../../../lib/contracts/config.js'
import { anchoredError } from '../../../lib/utils/error.js'

export function coerceField(
  fields: FieldsConfig,
  name: string,
  raw: string,
): string | number | boolean {
  const kind = fields[name]
  if (kind === undefined)
    throw anchoredError('UnknownField', `no declared custom field '${name}'`, [
      Object.keys(fields).length > 0
        ? `declared fields: ${Object.keys(fields).join(', ')}`
        : 'declare it under top-level `fields` in anchored.yml (name: string|number|boolean)',
    ])
  if (kind === 'string') return raw
  if (kind === 'number') {
    const n = Number(raw)
    if (Number.isNaN(n))
      throw anchoredError('InvalidFieldValue', `field '${name}' is a number, got '${raw}'`)
    return n
  }
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw anchoredError('InvalidFieldValue', `field '${name}' is a boolean, got '${raw}'`)
}
