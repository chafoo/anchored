import { test, expect } from 'bun:test'
import { assertTransition } from './transitions.js'
import { type AnchoredError } from '../../../lib/utils/error.js'
import { phase } from '../../../modules/phase/phase.js'
import { task } from '../../../modules/task/task.js'
import { epic } from '../../../modules/epic/epic.js'

// a1 — legal forward chains per tier + idempotent self-transition. The guard reads
// the edges off the condition bundle (descriptor.transitions) — fully tier-generic.
test('legal forward transitions + idempotent self-edge', () => {
  const taskChain = ['plan', 'drafted', 'refined', 'build', 'wrap', 'done']
  for (let i = 0; i < taskChain.length - 1; i++) {
    expect(() => assertTransition(task, taskChain[i]!, taskChain[i + 1]!)).not.toThrow()
  }
  expect(() => assertTransition(phase, 'pending', 'in-progress')).not.toThrow()
  expect(() => assertTransition(phase, 'in-progress', 'done')).not.toThrow()
  // D1 — epic now mirrors the task chain exactly (same words + edges)
  const epicChain = ['plan', 'drafted', 'refined', 'build', 'wrap', 'done']
  for (let i = 0; i < epicChain.length - 1; i++) {
    expect(() => assertTransition(epic, epicChain[i]!, epicChain[i + 1]!)).not.toThrow()
  }
  expect(() => assertTransition(task, 'build', 'build')).not.toThrow() // idempotent
})

// a2 — illegal backward/skip throws with suggestions naming legal next states
test('illegal transitions throw with suggestions', () => {
  let err: unknown
  try {
    assertTransition(task, 'done', 'plan')
  } catch (e) {
    err = e
  }
  expect(err).toBeDefined()
  expect((err as AnchoredError).kind).toBe('InvalidTransition')
  expect((err as AnchoredError).suggestions).toContain('drafted')
  expect(() => assertTransition(phase, 'done', 'pending')).toThrow()
  expect(() => assertTransition(epic, 'wrap', 'plan')).toThrow() // skip-back forbidden
})

// a3 — update-mode backedge allowed; any other backedge forbidden
test('update-mode backedge to drafted allowed; other backedges forbidden', () => {
  expect(() => assertTransition(task, 'refined', 'drafted')).not.toThrow()
  expect(() => assertTransition(task, 'build', 'drafted')).not.toThrow()
  expect(() => assertTransition(task, 'done', 'drafted')).not.toThrow()
  expect(() => assertTransition(task, 'build', 'refined')).toThrow() // not the backedge
})
