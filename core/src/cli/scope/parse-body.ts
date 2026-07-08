// cli/scope/parse-body.ts — anchor/amend take their structured body via stdin (a YAML or
// JSON document — YAML is a superset, one parser). This turns the raw stdin string into
// the object the verb expects, loudly.
import type { Yaml } from '../../lib/contracts/fs.js'
import { anchoredError } from '../../lib/utils/error.js'

export function parseBody(yaml: Yaml, raw: string, verb: string): Record<string, unknown> {
  if (raw.trim() === '')
    throw anchoredError('Usage', `${verb} reads its body from stdin (YAML or JSON)`, [
      `echo '{"goal": "…", "criteria": [{"text": "…"}]}' | anchored ${verb} <slug>`,
    ])
  let parsed: unknown
  try {
    parsed = yaml.parse(raw, { maxAliasCount: 0 })
  } catch (e) {
    throw anchoredError('Usage', `${verb} body is not valid YAML/JSON: ${(e as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw anchoredError('Usage', `${verb} body must be a mapping/object`)
  return parsed as Record<string, unknown>
}
