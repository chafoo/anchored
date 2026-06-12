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

// the framework default task.wrap is git-free — only the review + summarize
// workers. The framework writes to the task-files via the CLI; it never commits.
test('default task.wrap is review + summarize only (no git/commit default)', () => {
  const plan = createStepsPlanner(defaultCfg).plan('task', 'wrap')
  expect(plan.steps.map((s) => [s.name, s.agent])).toEqual([
    ['review', 'wrap-review'],
    ['summarize', 'wrap-summarize'],
  ])
  expect(plan.steps.some((s) => s.kind === 'run')).toBe(false)
})

// after_done is an OPT-IN marker: when a user adds a trailing run-step with
// after_done, the planner surfaces it so the wrap SKILL runs it AFTER the
// done-flip (captures the terminal status, clean tree).
test('passes after_done through for a user-declared trailing run-step', () => {
  const cfg = {
    task: { wrap: { steps: [{ name: 'commit', after_done: true, run: 'echo hi' }] } },
  } as Record<string, unknown>
  const plan = createStepsPlanner(cfg).plan('task', 'wrap')
  const commit = plan.steps.find((s) => s.name === 'commit')
  expect(commit?.kind).toBe('run')
  expect(commit?.after_done).toBe(true)
})

// D2 — epic.refine is now a REAL pipeline: ground vs code, author per-stub
// outcome-ACs, then walk (was just [walk]).
test('plans epic.refine as epic-plan-check → epic-decompose → walk (D2)', () => {
  const plan = createStepsPlanner(defaultCfg).plan('epic', 'refine')
  expect(plan.steps.map((s) => [s.name, s.kind, s.agent])).toEqual([
    ['epic-plan-check', 'worker', 'epic-plan-check'],
    ['epic-decompose', 'worker', 'epic-decompose'],
    ['walk', 'worker', 'walk'], // walk is skill-routed (ref 'walk'), spawned by the skill
  ])
})
