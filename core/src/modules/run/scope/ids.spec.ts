import { test, expect } from 'bun:test'
import { nextId } from './ids.js'

test('mints c1/a1 on empty', () => {
  expect(nextId('c', [])).toBe('c1')
  expect(nextId('a', [])).toBe('a1')
})

test('continues past the highest existing number (never reuses)', () => {
  expect(nextId('c', [{ id: 'c1' }, { id: 'c5' }, { id: 'c2' }])).toBe('c6')
  expect(nextId('a', [{ id: 'a2' }])).toBe('a3')
})

test('ignores foreign prefixes', () => {
  expect(nextId('c', [{ id: 'a9' }])).toBe('c1')
})
