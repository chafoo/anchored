import { test, expect } from 'bun:test'
import type { ConfigPort, StepPlan, PlanStep } from './config.js'

// contracts/config is interface-only — conformance spec pins the plan types + the
// ConfigPort surface (planFor / fields / raw) the skills + store consume.
test('a1 — an in-memory ConfigPort conforms and returns a plan', () => {
  const step: PlanStep = { name: 'implement', kind: 'worker', agent: 'build-implement' }
  const plan: StepPlan = { tier: 'task', stage: 'build', steps: [step] }
  const config: ConfigPort = {
    planFor: (tier, stage) => ({ ...plan, tier, stage }),
    fields: () => ({ commit_sha: 'string' }),
    raw: () => ({ task: {} }),
  }

  const p = config.planFor('task', 'build')
  expect(p.steps[0]!.kind).toBe('worker')
  expect(config.fields('task').commit_sha).toBe('string')
  expect(config.raw()).toHaveProperty('task')
})

// a2 — the three PlanStep kinds are representable on the shared shape
test('a2 — worker | run | loop steps are all representable', () => {
  const steps: PlanStep[] = [
    { name: 'w', kind: 'worker', agent: 'a' },
    { name: 'r', kind: 'run', run: 'bun test' },
    { name: 'l', kind: 'loop', each: 'phase', stop: ['done'], retry_limit: 3 },
  ]
  expect(steps.map((s) => s.kind)).toEqual(['worker', 'run', 'loop'])
})
