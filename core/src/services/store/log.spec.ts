import { test, expect } from 'bun:test'
import { appendLog, type LogEntry } from './log.js'

const entry = (kind: string): LogEntry => ({
  at: '2026-06-14T00:00:00Z',
  kind,
  note: `${kind} note`,
})

// a1 — appendLog returns the entry appended at the tail, in order
test('appendLog appends to the end preserving order', () => {
  const a = entry('created')
  const b = entry('status')
  expect(appendLog([a], b)).toEqual([a, b])
})

// a2 — empty log yields a single-element log
test('appendLog on empty log yields one entry', () => {
  const a = entry('created')
  expect(appendLog([], a)).toEqual([a])
})

// a3 — pure: input log is never mutated (new array, append-only)
test('appendLog does not mutate the input log', () => {
  const log: LogEntry[] = [entry('created')]
  const result = appendLog(log, entry('status'))
  expect(log).toHaveLength(1)
  expect(result).not.toBe(log)
  expect(result).toHaveLength(2)
})

// a4 — existing entries are passed through by reference (no deep copy)
test('appendLog leaves existing entries untouched by identity', () => {
  const a = entry('created')
  const result = appendLog([a], entry('status'))
  expect(result[0]).toBe(a)
})
