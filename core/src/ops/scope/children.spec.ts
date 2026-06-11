import { test, expect } from 'bun:test'
import { nextChild, readyChildren, addChild, moveChild } from './children.js'

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

// q8 — ready-children = ALL runnable (pending + deps done) for parallel fan-out,
// gated by the DAG; active children are excluded (they're already in flight)
test('ready-children returns the full DAG-ready batch (the fan-out set)', () => {
  // a fan: core done → two independent features both depending on core → both ready
  const fan = [
    { slug: 'core', status: 'done' },
    { slug: 'feat-a', status: 'pending', depends_on: ['core'] },
    { slug: 'feat-b', status: 'pending', depends_on: ['core'] },
    { slug: 'feat-c', status: 'pending', depends_on: ['feat-a'] }, // still gated
  ]
  expect(readyChildren(fan).map((c) => c.slug)).toEqual(['feat-a', 'feat-b'])
  // before core is done, nothing in the fan is runnable
  const blocked = fan.map((c) => (c.slug === 'core' ? { ...c, status: 'pending' } : c))
  expect(readyChildren(blocked).map((c) => c.slug)).toEqual(['core'])
  // an in-flight child is NOT re-launched (excluded from the batch)
  expect(
    readyChildren([
      { slug: 'a', status: 'active' },
      { slug: 'b', status: 'pending' },
    ]).map((c) => c.slug),
  ).toEqual(['b'])
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
