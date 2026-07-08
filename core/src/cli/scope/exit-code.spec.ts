import { test, expect } from 'bun:test'
import { exitCodeFor } from './exit-code.js'
import { anchoredError } from '../../lib/utils/error.js'

test('refusals exit 2, contention exits 3, the unexpected exits 1', () => {
  expect(exitCodeFor(anchoredError('CloseBlocked', 'x'))).toBe(2)
  expect(exitCodeFor(anchoredError('WriteContention', 'x'))).toBe(3)
  expect(exitCodeFor(Object.assign(new Error('invalid'), { issues: [] }))).toBe(2)
  expect(exitCodeFor(new Error('ENOENT'))).toBe(1)
})
