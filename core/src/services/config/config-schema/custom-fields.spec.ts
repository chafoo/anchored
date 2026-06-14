// custom-fields.spec.ts — declared custom fields extend a tier schema without
// loosening the strict check on known fields. (Dogfood finding: a declared
// `task.fields.commit_sha` could not be set — persist rejected the unknown key.)
import { describe, it, expect } from 'bun:test'
import { extendSchemaWithFields } from './custom-fields.js'
import { TaskNodeSchema } from '../../../modules/task/task.js'

const base = {
  schema_version: 2,
  slug: 'demo',
  title: 'Demo',
  status: 'plan' as const,
}

describe('extendSchemaWithFields', () => {
  it('returns the base schema unchanged when no fields are declared', () => {
    expect(extendSchemaWithFields(TaskNodeSchema, undefined)).toBe(TaskNodeSchema)
  })

  it('lets a declared custom field validate (read + write)', () => {
    const schema = extendSchemaWithFields(TaskNodeSchema, { commit_sha: 'string' })
    const parsed = schema.parse({ ...base, commit_sha: 'abc123' })
    expect((parsed as { commit_sha?: string }).commit_sha).toBe('abc123')
  })

  it('still rejects an UNdeclared key — strictness is preserved', () => {
    const schema = extendSchemaWithFields(TaskNodeSchema, { commit_sha: 'string' })
    expect(() => schema.parse({ ...base, totally_unknown: 'x' })).toThrow()
  })

  it('types a declared scalar field — a number field rejects a non-number', () => {
    const schema = extendSchemaWithFields(TaskNodeSchema, { coverage_pct: 'number' })
    expect(() => schema.parse({ ...base, coverage_pct: 'not-a-number' })).toThrow()
    expect(schema.parse({ ...base, coverage_pct: 87 })).toMatchObject({ coverage_pct: 87 })
  })

  it('does not weaken a KNOWN field declared again in fields (status stays an enum)', () => {
    // config.fields lists default fields too (status, slug, …) — re-declaring them
    // must NOT replace their strict typed check with a loose custom one.
    const schema = extendSchemaWithFields(TaskNodeSchema, {
      status: 'string',
      commit_sha: 'string',
    })
    expect(() => schema.parse({ ...base, status: 'not-a-real-status' })).toThrow()
  })

  it('Q4: a pipe-union type string becomes a real enum (off-enum value rejected)', () => {
    const schema = extendSchemaWithFields(TaskNodeSchema, { tier_level: 'low | medium | high' })
    expect(schema.parse({ ...base, tier_level: 'medium' })).toMatchObject({ tier_level: 'medium' })
    expect(() => schema.parse({ ...base, tier_level: 'bogus' })).toThrow()
  })
})
