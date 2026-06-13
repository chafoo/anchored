import { test, expect } from 'bun:test'
import { resolveSteps } from './resolve-steps.js'

// a1 — fills missing steps from provided defaults + normalises
test('resolve-steps falls back to defaults when steps are absent', () => {
  const steps = resolveSteps({}, { defaults: [{ name: 'discover' }, { name: 'decompose' }] })
  expect(steps.map((s) => s.name)).toEqual(['discover', 'decompose'])
})

// a2 — build:{each} shorthand → positioned loop step with implicit [run] body
test('each shorthand expands to a loop step with implicit [run] body', () => {
  const steps = resolveSteps({ each: 'task' })
  expect(steps.length).toBe(1)
  expect(steps[0]?.name).toBe('loop')
  expect(steps[0]?.each).toBe('task')
  expect(steps[0]?.steps).toEqual([{ name: 'run' }])
})

test('an explicit loop step without a body also gets the implicit [run]', () => {
  const steps = resolveSteps({ steps: [{ name: 'loop', each: 'phase' }] })
  expect(steps[0]?.steps).toEqual([{ name: 'run' }])
})
