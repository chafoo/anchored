import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { createStepsPlanner } from './steps-planner.js'

const defaultCfg = parse(
  readFileSync(new URL('../../default-template/anchored.default.yml', import.meta.url), 'utf8'),
) as Record<string, unknown>

// the planner turns task.plan into worker steps mapped to plugin agents
test('plans task.plan as workers mapped to plugin agents', () => {
  const plan = createStepsPlanner(defaultCfg).plan('task', 'plan')
  expect(plan.tier).toBe('task')
  expect(plan.steps.map((s) => [s.name, s.kind, s.agent])).toEqual([
    ['discover', 'worker', 'plan-discover'],
    ['rules-scan', 'worker', 'plan-rules-scan'],
    ['decompose', 'worker', 'plan-decompose'],
  ])
})

// phase.build is the leaf worker pipeline (implement → validate gates)
test('plans phase.build as implement + the two gates', () => {
  const plan = createStepsPlanner(defaultCfg).plan('phase', 'build')
  expect(plan.steps.map((s) => [s.name, s.agent])).toEqual([
    ['implement', 'build-implement'],
    ['task-validate', 'build-task-validate'],
    ['code-validate', 'build-code-validate'],
  ])
})

// task.build is the loop edge — each:phase + stop + retry_limit surfaced
test('plans task.build as a loop edge with each/stop/retry_limit', () => {
  const plan = createStepsPlanner(defaultCfg).plan('task', 'build')
  expect(plan.steps).toHaveLength(1)
  const loop = plan.steps[0]!
  expect(loop.kind).toBe('loop')
  expect(loop.each).toBe('phase')
  expect(loop.retry_limit).toBe(3)
  expect(loop.stop).toEqual(['a decision deviates from the plan'])
})

// epic.build loops tasks; epic.wrap is the roll-up
test('plans epic.build (loop tasks) + epic.wrap (roll-up)', () => {
  const planner = createStepsPlanner(defaultCfg)
  expect(planner.plan('epic', 'build').steps[0]?.each).toBe('task')
  expect(planner.plan('epic', 'wrap').steps.map((s) => [s.name, s.agent])).toEqual([
    ['roll-up', 'epic-roll-up'],
  ])
})
