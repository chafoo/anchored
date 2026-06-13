import { test, expect } from 'bun:test'
import { classifyTier } from './classify.js'
import { planCommand } from './plan.js'
import type { CliDeps } from '../../cli.js'
import { fakeFacade } from '../../cli.spec.js'

// a1 — tripwire: <5 → task, >=10 → epic
test('classify tripwire: <5 → task, >=10 → epic', () => {
  expect(classifyTier(3)).toBe('task')
  expect(classifyTier(4)).toBe('task')
  expect(classifyTier(10)).toBe('epic')
  expect(classifyTier(12)).toBe('epic')
})

// a2 — grey zone 5–9 routes by the independence test
test('classify grey zone 5–9 routes by independence', () => {
  expect(classifyTier(7, true)).toBe('epic')
  expect(classifyTier(7, false)).toBe('task')
})

// a3 — plan without a tier routes through classify and returns a tier
test('plan without a tier routes through classify and returns a tier', async () => {
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
    tierFor: () => 'task',
    classify: async () => ({ tier: 'epic', reasoning: 'independent units' }),
    out: () => {},
  }
  const r = (await planCommand(['build a whole subsystem'], deps)) as { tier: string }
  expect(['task', 'epic']).toContain(r.tier)
  expect(r.tier).toBe('epic')
})
