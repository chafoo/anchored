import { test, expect } from 'bun:test'
import type { TemplatePort, Step, StepPlan } from './template.js'

// conformance: an in-memory TemplatePort serves steps (DATA, worker inline) + fields.
test('an in-memory TemplatePort serves steps with inline workers + fields', () => {
  const step: Step = { name: 'implement', worker: 'build-implement', type: 'agent' }
  const plan: StepPlan = { tier: 'task', stage: 'build', steps: [step], each: 'phase' }
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

// step shapes are plain data; the loop edge is stage-level on the plan
test('worker/run/walk steps are plain data; loop edge is on the plan', () => {
  const steps: Step[] = [
    { name: 'implement', worker: 'build-implement', type: 'agent' },
    { name: 'gate', run: 'bun test' },
    { name: 'walk', worker: 'walk', type: 'skill', involve: 'high-only' },
  ]
  expect(steps.map((s) => s.name)).toEqual(['implement', 'gate', 'walk'])
  const plan: StepPlan = { tier: 'task', stage: 'build', steps, each: 'phase', retry_limit: 3 }
  expect(plan.each).toBe('phase')
})
