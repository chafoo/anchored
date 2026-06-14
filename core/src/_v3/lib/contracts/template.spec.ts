import { test, expect } from 'bun:test'
import type { TemplatePort, Step, StepPlan } from './template.js'

// conformance: an in-memory TemplatePort serves steps (DATA, worker inline) + fields.
test('an in-memory TemplatePort serves steps with inline workers + fields', () => {
  const step: Step = { name: 'implement', worker: 'build-implement' }
  const plan: StepPlan = { tier: 'task', stage: 'build', steps: [step] }
  const template: TemplatePort = {
    steps: (tier, stage) => ({ ...plan, tier, stage }),
    fields: () => ({ commit_sha: 'string' }),
    validate: () => ({ ok: true }),
    raw: () => ({ task: {} }),
  }

  const p = template.steps('task', 'build')
  expect(p.steps[0]!.worker).toBe('build-implement') // worker is inline data, not resolved
  expect(template.fields('task').commit_sha).toBe('string')
  expect(template.validate()).toEqual({ ok: true })
  expect(template.raw()).toHaveProperty('task')
})

// the three step shapes are representable as plain data
test('worker | run | loop steps are all plain data', () => {
  const steps: Step[] = [
    { name: 'w', worker: 'a' },
    { name: 'r', run: 'bun test' },
    { name: 'l', each: 'phase', stop: ['done'], retry_limit: 3 },
  ]
  expect(steps.map((s) => s.name)).toEqual(['w', 'r', 'l'])
})
