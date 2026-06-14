import { test, expect } from 'bun:test'
import {
  lifecycleStatusValues,
  phaseStatusValues,
  stubStatusValues,
  phaseExecutorValues,
} from './statuses.js'

test('the fixed axes have their exact shape', () => {
  expect(lifecycleStatusValues).toEqual(['plan', 'drafted', 'refined', 'build', 'wrap', 'done'])
  expect(phaseStatusValues).toEqual(['pending', 'in-progress', 'done', 'blocked', 'deferred'])
  expect(stubStatusValues).toEqual(['pending', 'active', 'done', 'blocked'])
  expect(stubStatusValues).not.toContain('in-progress')
  expect(phaseExecutorValues).toEqual(['implement', 'workflow'])
})
