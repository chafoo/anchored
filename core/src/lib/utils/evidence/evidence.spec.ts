import { test, expect } from 'bun:test'
import { isEvidenceFilled } from './evidence.js'

// pure table-driven predicate — rejects empty/whitespace/sentinel, accepts real
test('isEvidenceFilled rejects empty/whitespace/sentinel, accepts real', () => {
  expect(isEvidenceFilled([])).toBe(false)
  expect(isEvidenceFilled(['  '])).toBe(false)
  expect(isEvidenceFilled(['—'])).toBe(false)
  expect(isEvidenceFilled([' — '])).toBe(false)
  expect(isEvidenceFilled(null)).toBe(false)
  expect(isEvidenceFilled(undefined)).toBe(false)
  expect(isEvidenceFilled('src/x.ts:1')).toBe(false) // not an array
  expect(isEvidenceFilled([42])).toBe(false) // not a string
  expect(isEvidenceFilled(['src/x.ts:42 — foo'])).toBe(true)
  expect(isEvidenceFilled(['  ', 'real:1 — p'])).toBe(true) // one real entry suffices
})
