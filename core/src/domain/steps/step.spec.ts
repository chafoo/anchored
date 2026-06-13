import { test, expect } from 'bun:test'
import { StepSchema, parseStep, safeParseStep } from './step.js'

// a1 — name + at most one of run|use|each; both run+use rejected; bare name ok
test('step: run XOR use; both rejected; bare built-in reference accepted', () => {
  expect(StepSchema.safeParse({ name: 'x', run: 'a', use: 'b' }).success).toBe(false)
  expect(StepSchema.safeParse({ name: 'x', run: 'eslint .' }).success).toBe(true)
  expect(StepSchema.safeParse({ name: 'x', use: 'plan-decompose' }).success).toBe(true)
  // bare name = built-in reference (default template is full of `{ name: implement }`)
  expect(StepSchema.safeParse({ name: 'implement' }).success).toBe(true)
  expect(StepSchema.safeParse({}).success).toBe(false) // name is required
})

// a2 — type only on use-step; involve only on walk; instructions on any
test('step: type/involve/instructions placement', () => {
  expect(StepSchema.safeParse({ name: 'x', run: 'a', type: 'agent' }).success).toBe(false)
  expect(StepSchema.safeParse({ name: 'x', use: 'a', type: 'agent' }).success).toBe(true)
  expect(StepSchema.safeParse({ name: 'walk', involve: 'high-only' }).success).toBe(true)
  expect(StepSchema.safeParse({ name: 'notwalk', involve: 'all' }).success).toBe(false)
  expect(StepSchema.safeParse({ name: 'implement', instructions: 'use TDD' }).success).toBe(true)
  expect(StepSchema.safeParse({ name: 'x', run: 'a', instructions: 'note' }).success).toBe(true)
})

// a3 — loop step: each + recursive steps body; loop with run rejected
test('step: loop step parses recursive body; loop+run rejected', () => {
  const loop = parseStep({
    name: 'loop',
    each: 'phase',
    steps: [{ name: 'run' }, { name: 'commit', run: 'git commit' }],
  })
  expect(loop.each).toBe('phase')
  expect(loop.steps?.length).toBe(2)
  expect(loop.steps?.[1]?.run).toBe('git commit')
  expect(StepSchema.safeParse({ name: 'loop', each: 'phase', run: 'x' }).success).toBe(false)
  // steps body only on a loop step
  expect(
    StepSchema.safeParse({ name: 'x', run: 'a', steps: [{ name: 'y', run: 'b' }] }).success,
  ).toBe(false)
})

// instructions — allowed on any step shape, including a run-step
test('step: instructions is accepted on a run-step', () => {
  expect(
    StepSchema.safeParse({
      name: 'commit',
      run: 'git ...',
      instructions: 'commit with a conventional message',
    }).success,
  ).toBe(true)
  const parsed = parseStep({
    name: 'commit',
    run: 'git ...',
    instructions: 'commit with a conventional message',
  })
  expect(parsed.instructions).toBe('commit with a conventional message')
})

// a4 — parseStep throws; safeParseStep returns a discriminated union
test('step: parseStep throws, safeParseStep returns union', () => {
  expect(() => parseStep({ name: 'x', run: 'a', use: 'b' })).toThrow()
  const ok = safeParseStep({ name: 'implement' })
  expect(ok.ok).toBe(true)
  if (ok.ok) expect(ok.value.name).toBe('implement')
  const bad = safeParseStep({})
  expect(bad.ok).toBe(false)
  if (!bad.ok) expect(bad.error.issues.length).toBeGreaterThan(0)
})
