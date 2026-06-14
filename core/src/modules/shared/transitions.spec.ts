import { test, expect } from 'bun:test'
import { assertTransition, lifecycleTransitions, phaseTransitions } from './transitions.js'
import type { AnchoredError } from '../../lib/utils/error.js'

test('legal forward chains + idempotent self-edge', () => {
  const chain = ['plan', 'drafted', 'refined', 'build', 'wrap', 'done']
  for (let i = 0; i < chain.length - 1; i++) {
    expect(() => assertTransition(lifecycleTransitions, chain[i]!, chain[i + 1]!)).not.toThrow()
  }
  expect(() => assertTransition(phaseTransitions, 'pending', 'in-progress')).not.toThrow()
  expect(() => assertTransition(lifecycleTransitions, 'build', 'build')).not.toThrow()
})

test('illegal transition throws InvalidTransition with the legal next states', () => {
  let err: unknown
  try {
    assertTransition(lifecycleTransitions, 'done', 'plan', 'epic')
  } catch (e) {
    err = e
  }
  expect((err as AnchoredError).kind).toBe('InvalidTransition')
  expect((err as AnchoredError).message).toContain('epic')
  expect((err as AnchoredError).suggestions).toContain('drafted')
  expect(() => assertTransition(phaseTransitions, 'done', 'pending')).toThrow()
})

test('update-mode backedge to drafted allowed; other backedges forbidden', () => {
  expect(() => assertTransition(lifecycleTransitions, 'build', 'drafted')).not.toThrow()
  expect(() => assertTransition(lifecycleTransitions, 'build', 'refined')).toThrow()
})

test('optional stages skip: drafted → build and build → done are legal; order cannot jump', () => {
  expect(() => assertTransition(lifecycleTransitions, 'drafted', 'build')).not.toThrow() // skip refine
  expect(() => assertTransition(lifecycleTransitions, 'build', 'done')).not.toThrow() // skip wrap
  expect(() => assertTransition(lifecycleTransitions, 'plan', 'build')).toThrow() // no order-jump
  expect(() => assertTransition(lifecycleTransitions, 'drafted', 'done')).toThrow()
})
