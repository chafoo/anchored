// validate.spec.ts — the `anchored validate` report (D1): proves every tier×stage
// step plan resolves and surfaces the declared custom fields.
import { test, expect } from 'bun:test'
import { createValidator } from './validate.js'
import type { StepPlan } from '../../cli/commands/steps.js'

test('validate reports every tier×stage + the declared custom fields', () => {
  const config = {
    task: { fields: { research: 'string', commit_sha: 'string' } },
    phase: { fields: { coverage_pct: 'number' } },
  }
  // a fake planner: echoes the tier/stage so we can assert it was asked for each
  const plan = (tier: string, stage: string): StepPlan => ({
    tier,
    stage,
    steps: [{ name: `${tier}-${stage}-step`, kind: 'run' }],
  })
  const report = createValidator(config, plan).validate()

  expect(report.valid).toBe(true)
  // all three tiers × four stages present
  for (const tier of ['phase', 'task', 'epic']) {
    for (const stage of ['plan', 'refine', 'build', 'wrap']) {
      expect(report.tiers[tier]!.stages[stage]).toEqual([
        { name: `${tier}-${stage}-step`, kind: 'run' },
      ])
    }
  }
  // declared custom fields surface
  expect(report.tiers.task!.fields).toEqual(['research', 'commit_sha'])
  expect(report.tiers.phase!.fields).toEqual(['coverage_pct'])
  expect(report.tiers.epic!.fields).toEqual([])
})

test('a planner that throws on a malformed stage propagates (the validation signal)', () => {
  const plan = (_tier: string, stage: string): StepPlan => {
    if (stage === 'build') throw new Error('malformed build steps')
    return { tier: _tier, stage, steps: [] }
  }
  expect(() => createValidator({}, plan).validate()).toThrow(/malformed build/)
})
