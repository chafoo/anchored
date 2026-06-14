import { test, expect } from 'bun:test'
import { appendLog } from './log.js'

test('appendLog appends without mutating the input (pure)', () => {
  const log = [{ at: '1', kind: 'a', note: 'x' }]
  const next = appendLog(log, { at: '2', kind: 'b', note: 'y' })
  expect(next).toHaveLength(2)
  expect(next[1]).toEqual({ at: '2', kind: 'b', note: 'y' })
  expect(log).toHaveLength(1) // input untouched
})
