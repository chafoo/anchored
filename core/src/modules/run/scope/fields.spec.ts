import { test, expect } from 'bun:test'
import { coerceField } from './fields.js'
import type { AnchoredError } from '../../../lib/utils/error.js'

const fields = { commit: 'string', coverage_pct: 'number', reviewed: 'boolean' } as const

test('coerces per declared type', () => {
  expect(coerceField(fields, 'commit', 'abc123')).toBe('abc123')
  expect(coerceField(fields, 'coverage_pct', '91.5')).toBe(91.5)
  expect(coerceField(fields, 'reviewed', 'true')).toBe(true)
  expect(coerceField(fields, 'reviewed', 'false')).toBe(false)
})

test('an undeclared field throws UnknownField listing the declared ones', () => {
  try {
    coerceField(fields, 'ticket', 'x')
    expect.unreachable()
  } catch (e) {
    expect((e as AnchoredError).kind).toBe('UnknownField')
    expect((e as AnchoredError).suggestions?.[0]).toContain('commit')
  }
})

test('unparsable values throw InvalidFieldValue', () => {
  expect(() => coerceField(fields, 'coverage_pct', 'high')).toThrow(/is a number/)
  expect(() => coerceField(fields, 'reviewed', 'yes')).toThrow(/is a boolean/)
})
