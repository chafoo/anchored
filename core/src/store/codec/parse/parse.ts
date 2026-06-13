// parser/parse.ts — createParser(deps): YAML → typed node. Two profiles:
// task-file (no-alias, schema_version-gated node files) and anchored.yml (alias-ok
// config). yaml + schemas are injected seams (fakeable); no FS, no effects.
import { anchoredError } from '../../domain/invariants/invariants.js'

const SCHEMA_VERSION = 2
const SIZE_CAP = 1_000_000 // 1 MB — guard against pathological inputs

export type Profile = 'task-file' | 'anchored.yml'

export interface ParserYaml {
  parse(raw: string, opts?: { maxAliasCount?: number }): unknown
}
export interface NodeSchema {
  parse(input: unknown): unknown
}
export interface ParserDeps {
  yaml: ParserYaml
  schemas: Record<string, NodeSchema>
}

export interface ParseOpts {
  profile: Profile
  tier: string
}

export function createParser(deps: ParserDeps) {
  const { yaml, schemas } = deps
  return {
    parseNodeYAML(raw: string, opts: ParseOpts): unknown {
      const { profile, tier } = opts
      if (raw.length > SIZE_CAP) {
        throw anchoredError(
          'ParseError',
          `input exceeds size cap (${raw.length} > ${SIZE_CAP} bytes)`,
        )
      }
      // Hardening: the task-file profile forbids YAML aliases (alias-bomb / reference
      // trickery); the anchored.yml profile allows them (for _lib reuse).
      let data: unknown
      try {
        data = yaml.parse(raw, profile === 'task-file' ? { maxAliasCount: 0 } : {})
      } catch (e) {
        throw anchoredError('ParseError', `invalid YAML (${profile}): ${(e as Error).message}`)
      }
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw anchoredError('ParseError', 'a node/config file must be a YAML mapping')
      }
      // schema_version gate (node files only) — runs BEFORE generic validation.
      if (profile === 'task-file' && tier !== 'phase') {
        const sv = (data as Record<string, unknown>).schema_version
        if (sv === undefined) {
          throw anchoredError('ParseError', 'missing schema_version', [
            `add: schema_version: ${SCHEMA_VERSION}`,
          ])
        }
        if (sv !== SCHEMA_VERSION) {
          throw anchoredError(
            'ParseError',
            `unsupported schema_version ${String(sv)} (expected ${SCHEMA_VERSION})`,
          )
        }
      }
      const schema = schemas[tier]
      if (!schema) {
        throw anchoredError('ParseError', `unknown tier '${tier}'`, [
          `known: ${Object.keys(schemas).join(', ')}`,
        ])
      }
      try {
        return schema.parse(data)
      } catch (e) {
        throw anchoredError(
          'ParseError',
          `schema validation failed (${tier}): ${(e as Error).message}`,
        )
      }
    },
  }
}
