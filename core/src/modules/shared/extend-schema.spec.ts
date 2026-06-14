import { test, expect } from 'bun:test'
import { z } from 'zod'
import { extendSchema } from './extend-schema.js'

const base = z.strictObject({ slug: z.string(), status: z.string() })

test('no fields → base unchanged (strict path intact)', () => {
  expect(extendSchema(base, undefined)).toBe(base)
  expect(
    extendSchema(base, undefined).safeParse({ slug: 's', status: 'x', extra: 1 }).success,
  ).toBe(false)
})

test('declared scalar + enum custom fields validate; known keys are not re-added', () => {
  const ext = extendSchema(base, { commit_sha: 'string', tier_kind: 'a | b', status: 'string' })
  expect(ext.safeParse({ slug: 's', status: 'x', commit_sha: 'abc', tier_kind: 'a' }).success).toBe(
    true,
  )
  expect(ext.safeParse({ slug: 's', status: 'x', tier_kind: 'z' }).success).toBe(false) // off-enum
  expect(ext.safeParse({ slug: 's', status: 'x', commit_sha: 123 }).success).toBe(false) // wrong type
})

test('a richer type-string falls back to permissive unknown (still persisted)', () => {
  const ext = extendSchema(base, { notes: 'list<string>' })
  expect(ext.safeParse({ slug: 's', status: 'x', notes: ['a', 'b'] }).success).toBe(true)
})
