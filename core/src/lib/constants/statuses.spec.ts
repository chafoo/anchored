import { test, expect } from 'bun:test'
import {
  lifecycleStatusValues,
  phaseStatusValues,
  stubStatusValues,
  phaseExecutorValues,
} from './statuses.js'

// the axes are fixed — assert their exact shape so a tier module + the store can
// never drift apart on what a status word means.
test('lifecycle axis is the uniform plan→done form', () => {
  expect(lifecycleStatusValues).toEqual(['plan', 'drafted', 'refined', 'build', 'wrap', 'done'])
})

test('phase axis is the leaf work-once form', () => {
  expect(phaseStatusValues).toEqual(['pending', 'in-progress', 'done', 'blocked', 'deferred'])
})

test('stub axis is the loop-queue marker (active, never in-progress)', () => {
  expect(stubStatusValues).toEqual(['pending', 'active', 'done', 'blocked'])
  expect(stubStatusValues).not.toContain('in-progress')
})

test('executor axis is implement | workflow', () => {
  expect(phaseExecutorValues).toEqual(['implement', 'workflow'])
})
