import { test, expect } from 'bun:test'
import { nextChild, addChild, moveChild } from './children.js'

// a1 — first pending whose depends_on are all done; unmet deps skipped
test('next-child returns first pending with satisfied depends_on', () => {
  const children = [
    { slug: 'a', status: 'done' },
    { slug: 'b', status: 'pending', depends_on: ['c'] }, // waits on c
    { slug: 'c', status: 'pending', depends_on: ['a'] }, // a is done → ready
  ]
  expect(nextChild(children)?.slug).toBe('c')
})

// a2 — resume-safety: an active child wins over any pending
test('next-child prefers an active/in-progress child', () => {
  expect(
    nextChild([
      { slug: 'a', status: 'pending' },
      { slug: 'b', status: 'in-progress' },
    ])?.slug,
  ).toBe('b')
  expect(
    nextChild([
      { slug: 'a', status: 'pending' },
      { slug: 'b', status: 'active' },
    ])?.slug,
  ).toBe('b')
})

// a3 — null when nothing runnable (all done, or deadlocked pending)
test('next-child returns null when nothing is runnable', () => {
  expect(nextChild([{ slug: 'a', status: 'done' }])).toBeNull()
  expect(nextChild([{ slug: 'a', status: 'pending', depends_on: ['missing'] }])).toBeNull()
})

// a4 — add throws on duplicate slug; move reorders keeping done children
test('add-child rejects duplicate slug; move-child reorders', () => {
  const children = [
    { slug: 'a', status: 'done' },
    { slug: 'b', status: 'pending' },
  ]
  expect(() => addChild(children, { slug: 'a', status: 'pending' })).toThrow()
  expect(addChild(children, { slug: 'c', status: 'pending' }).map((c) => c.slug)).toEqual([
    'a',
    'b',
    'c',
  ])
  const moved = moveChild(children, 'b', 0)
  expect(moved.map((c) => c.slug)).toEqual(['b', 'a'])
  expect(moved.find((c) => c.slug === 'a')?.status).toBe('done') // done child preserved
})
