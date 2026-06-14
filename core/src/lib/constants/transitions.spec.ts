import { test, expect } from 'bun:test'
import { lifecycleTransitions, phaseTransitions } from './transitions.js'

// lifecycle: forward edges + the single backward update-mode re-entry to drafted
test('lifecycle edges are forward-only with the drafted re-entry', () => {
  expect(lifecycleTransitions.plan).toEqual(['drafted'])
  expect(lifecycleTransitions.drafted).toEqual(['refined'])
  expect(lifecycleTransitions.refined).toEqual(['build', 'drafted'])
  expect(lifecycleTransitions.build).toEqual(['wrap', 'drafted'])
  expect(lifecycleTransitions.wrap).toEqual(['done', 'drafted'])
  expect(lifecycleTransitions.done).toEqual(['drafted'])
})

// phase: pending→in-progress→terminal; blocked resumes, done/deferred terminal
test('phase edges terminate at done/deferred', () => {
  expect(phaseTransitions.pending).toEqual(['in-progress'])
  expect(phaseTransitions['in-progress']).toEqual(['done', 'blocked', 'deferred'])
  expect(phaseTransitions.blocked).toEqual(['in-progress'])
  expect(phaseTransitions.done).toEqual([])
  expect(phaseTransitions.deferred).toEqual([])
})
