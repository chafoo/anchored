import { test, expect } from 'bun:test'
import { isEvidenceFilled } from './evidence.js'

test('isEvidenceFilled rejects empty/whitespace/sentinel/non-array, accepts a real entry', () => {
  expect(isEvidenceFilled([])).toBe(false)
  expect(isEvidenceFilled(['  '])).toBe(false)
  expect(isEvidenceFilled(['—'])).toBe(false)
  expect(isEvidenceFilled(' — ' as unknown)).toBe(false)
  expect(isEvidenceFilled(null)).toBe(false)
  expect(isEvidenceFilled([42])).toBe(false)
  expect(isEvidenceFilled(['src/x.ts:42 — p'])).toBe(true)
  expect(isEvidenceFilled(['  ', 'real:1 — p'])).toBe(true)
})
