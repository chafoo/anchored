import { test, expect } from 'bun:test'
import { nextChild, readyChildren, addChild, moveChild } from './children.js'
import type { AnchoredError } from '../../lib/utils/error.js'

const C = (slug: string, status: string, depends_on?: string[]) => ({ slug, status, depends_on })

test('nextChild: active wins; else first dependency-satisfied pending; else null', () => {
  expect(nextChild([C('a', 'done'), C('b', 'active'), C('c', 'pending')])?.slug).toBe('b')
  expect(nextChild([C('a', 'done'), C('b', 'pending', ['a'])])?.slug).toBe('b')
  expect(nextChild([C('a', 'pending', ['x'])])).toBeNull() // unmet dependency
  expect(nextChild([C('a', 'done')])).toBeNull()
})

test('readyChildren: all pending with deps done (no active)', () => {
  const ready = readyChildren([C('a', 'done'), C('b', 'pending', ['a']), C('c', 'pending', ['x'])])
  expect(ready.map((c) => c.slug)).toEqual(['b'])
})

test('addChild rejects duplicate; moveChild reorders / rejects unknown', () => {
  expect(addChild([C('a', 'pending')], C('b', 'pending')).map((c) => c.slug)).toEqual(['a', 'b'])
  let err: unknown
  try {
    addChild([C('a', 'pending')], C('a', 'pending'))
  } catch (e) {
    err = e
  }
  expect((err as AnchoredError).kind).toBe('DuplicateSlug')
  expect(moveChild([C('a', 'pending'), C('b', 'pending')], 'b', 0).map((c) => c.slug)).toEqual([
    'b',
    'a',
  ])
  expect(() => moveChild([C('a', 'pending')], 'z', 0)).toThrow()
})
