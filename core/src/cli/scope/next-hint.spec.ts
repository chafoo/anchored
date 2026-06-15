// _v3/cli/scope/next-hint.spec.ts — unit: the F2 `next:` computation. Pure, plain objects in →
// string|undefined out → a spec.
import { test, expect } from 'bun:test'
import { nextHint } from './next-hint.js'

test('a lifecycle node yields its legal forward stages (minus the drafted re-entry)', () => {
  expect(nextHint({ slug: 't', status: 'drafted' })).toBe('status → refined | build')
  // build can skip to done (wrap optional); the drafted backward edge is dropped from the hint.
  expect(nextHint({ slug: 't', status: 'build' })).toBe('status → wrap | done')
})

test('a task points at the next ready phase', () => {
  const node = {
    slug: 't',
    status: 'build',
    phases: [{ slug: 'setup', status: 'pending' }],
  }
  expect(nextHint(node)).toBe('phase → setup')
})

test('a task with a ready fan-out lists the batch', () => {
  const node = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'a', status: 'pending' },
      { slug: 'b', status: 'pending' },
    ],
  }
  expect(nextHint(node)).toBe('phase → a (ready: a, b)')
})

test('a task with all phases terminal falls back to the lifecycle edge', () => {
  const node = {
    slug: 't',
    status: 'build',
    phases: [{ slug: 'setup', status: 'done' }],
  }
  expect(nextHint(node)).toBe('status → wrap | done')
})

test('an epic points at the next child stub', () => {
  const node = {
    slug: 'ep',
    status: 'build',
    tasks: [{ slug: 'login', status: 'pending' }],
  }
  expect(nextHint(node)).toBe('child → login')
})

test('a phase surfaces the open acceptance criteria', () => {
  const phase = {
    slug: 'setup',
    status: 'in-progress',
    acceptance_criteria: [
      { id: 'a1', status: 'pending' },
      { id: 'a2', status: 'done' },
    ],
  }
  expect(nextHint(phase)).toBe('evidence: a1')
})

test('a phase with all ACs terminal surfaces the next phase transition', () => {
  const phase = {
    slug: 'setup',
    status: 'in-progress',
    acceptance_criteria: [{ id: 'a1', status: 'done' }],
  }
  expect(nextHint(phase)).toBe('status → done | blocked | deferred')
})

test('a stage-plan result reads the wrapped node', () => {
  const plan = {
    tier: 'task',
    stage: 'build',
    steps: [],
    node: { slug: 't', status: 'build', phases: [{ slug: 'p', status: 'pending' }] },
  }
  expect(nextHint(plan)).toBe('phase → p')
})

test('a non-object or unknown shape yields no hint', () => {
  expect(nextHint(null)).toBeUndefined()
  expect(nextHint('str')).toBeUndefined()
  expect(nextHint({ foo: 1 })).toBeUndefined()
})
