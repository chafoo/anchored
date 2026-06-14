import { test, expect } from 'bun:test'
import type { TemplatePort, Step, StepPlan } from './template.js'

// conformance: an in-memory TemplatePort serves steps (DATA, worker inline via `use`) + fields.
test('an in-memory TemplatePort serves steps with inline workers + fields', () => {
  const step: Step = { name: 'implement', use: { type: 'agent', name: 'build-implement' } }
  const plan: StepPlan = { tier: 'task', stage: 'build', steps: [step], each: 'phase' }
  const template: TemplatePort = {
    steps: (tier, stage) => ({ ...plan, tier, stage }),
    fields: () => ({ commit_sha: 'string' }),
    validate: () => ({ ok: true }),
    raw: () => ({ task: {} }),
  }

  const p = template.steps('task', 'build')
  expect(p.steps[0]!.use?.name).toBe('build-implement') // worker is inline data, not resolved
  expect(template.fields('task').commit_sha).toBe('string')
  expect(template.validate()).toEqual({ ok: true })
  expect(template.raw()).toHaveProperty('task')
})

// step shapes are plain data; the loop edge is stage-level on the plan
test('instructions/use/walk steps are plain data; loop edge is on the plan', () => {
  const steps: Step[] = [
    { name: 'implement', use: { type: 'agent', name: 'build-implement' }, execute: 'workflow' },
    { name: 'gate', instructions: 'run bun test and confirm green' },
    { name: 'walk', use: { type: 'skill', name: 'walk' }, involve: 'high-only' },
  ]
  expect(steps.map((s) => s.name)).toEqual(['implement', 'gate', 'walk'])
  expect(steps[0]!.execute).toBe('workflow')
  const plan: StepPlan = { tier: 'task', stage: 'build', steps, each: 'phase', retry_limit: 3 }
  expect(plan.each).toBe('phase')
})
