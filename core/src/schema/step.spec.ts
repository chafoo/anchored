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

// provenance — only on a run-step; { field, ref? } shape; field required
test('step: provenance is run-step-only and shaped { field, ref? }', () => {
  // provenance on a run-step parses (field only, and field+ref)
  expect(
    StepSchema.safeParse({ name: 'commit', run: 'git commit', provenance: { field: 'commit_sha' } })
      .success,
  ).toBe(true)
  const withRef = parseStep({
    name: 'commit',
    run: 'git commit',
    provenance: { field: 'commit_sha', ref: 'HEAD' },
  })
  expect(withRef.provenance?.field).toBe('commit_sha')
  expect(withRef.provenance?.ref).toBe('HEAD')
  // provenance on a use-step is rejected (not a run-step)
  expect(
    StepSchema.safeParse({ name: 'x', use: 'agent', provenance: { field: 'f' } }).success,
  ).toBe(false)
  // provenance on a bare built-in reference is rejected (no run)
  expect(StepSchema.safeParse({ name: 'implement', provenance: { field: 'f' } }).success).toBe(
    false,
  )
  // provenance.field is required + non-empty
  expect(StepSchema.safeParse({ name: 'c', run: 'git commit', provenance: {} }).success).toBe(false)
  expect(
    StepSchema.safeParse({ name: 'c', run: 'git commit', provenance: { field: '' } }).success,
  ).toBe(false)
})

// after_done — only on a run-step; marks a pure-recorder step the wrap SKILL runs
// AFTER the done-flip (so it captures the terminal status + a clean tree)
test('step: after_done is run-step-only and boolean', () => {
  // after_done on a run-step parses
  expect(
    StepSchema.safeParse({ name: 'commit', run: 'git commit', after_done: true }).success,
  ).toBe(true)
  const parsed = parseStep({ name: 'commit', run: 'git commit', after_done: true })
  expect(parsed.after_done).toBe(true)
  // after_done on a use-step is rejected (not a run-step)
  expect(StepSchema.safeParse({ name: 'x', use: 'agent', after_done: true }).success).toBe(false)
  // after_done on a bare built-in reference is rejected (no run)
  expect(StepSchema.safeParse({ name: 'implement', after_done: true }).success).toBe(false)
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
