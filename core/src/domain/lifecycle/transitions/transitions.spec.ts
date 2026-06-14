import { test, expect } from 'bun:test'
import { assertTransition } from './transitions.js'
import { type AnchoredError } from '../../../error.js'
import { phaseDescriptor } from '../../tiers/phase.js'
import { taskDescriptor } from '../../tiers/task.js'
import { epicDescriptor } from '../../tiers/epic.js'

// a1 — legal forward chains per tier + idempotent self-transition
test('legal forward transitions + idempotent self-edge', () => {
  const taskChain = ['plan', 'drafted', 'refined', 'build', 'wrap', 'done']
  for (let i = 0; i < taskChain.length - 1; i++) {
    expect(() => assertTransition(taskDescriptor, taskChain[i]!, taskChain[i + 1]!)).not.toThrow()
  }
  expect(() => assertTransition(phaseDescriptor, 'pending', 'in-progress')).not.toThrow()
  expect(() => assertTransition(phaseDescriptor, 'in-progress', 'done')).not.toThrow()
  // D1 — epic now mirrors the task chain exactly (same words + edges)
  const epicChain = ['plan', 'drafted', 'refined', 'build', 'wrap', 'done']
  for (let i = 0; i < epicChain.length - 1; i++) {
    expect(() => assertTransition(epicDescriptor, epicChain[i]!, epicChain[i + 1]!)).not.toThrow()
  }
  expect(() => assertTransition(taskDescriptor, 'build', 'build')).not.toThrow() // idempotent
})

// a2 — illegal backward/skip throws with suggestions naming legal next states
test('illegal transitions throw with suggestions', () => {
  let err: unknown
  try {
    assertTransition(taskDescriptor, 'done', 'plan')
  } catch (e) {
    err = e
  }
  expect(err).toBeDefined()
  expect((err as AnchoredError).kind).toBe('InvalidTransition')
  expect((err as AnchoredError).suggestions).toContain('drafted')
  expect(() => assertTransition(phaseDescriptor, 'done', 'pending')).toThrow()
  expect(() => assertTransition(epicDescriptor, 'wrap', 'plan')).toThrow() // skip-back forbidden
})

// a3 — update-mode backedge allowed; any other backedge forbidden
test('update-mode backedge to drafted allowed; other backedges forbidden', () => {
  expect(() => assertTransition(taskDescriptor, 'refined', 'drafted')).not.toThrow()
  expect(() => assertTransition(taskDescriptor, 'build', 'drafted')).not.toThrow()
  expect(() => assertTransition(taskDescriptor, 'done', 'drafted')).not.toThrow()
  expect(() => assertTransition(taskDescriptor, 'build', 'refined')).toThrow() // not the backedge
})
