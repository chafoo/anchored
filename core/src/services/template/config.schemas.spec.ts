import { test, expect } from 'bun:test'
import { StepSchema, ConfigSchema } from './config.schemas.js'

test('StepSchema: use{type,name} + instructions + execute ok; no run; involve only on walk', () => {
  expect(
    StepSchema.safeParse({ name: 'implement', use: { type: 'agent', name: 'build-implement' } })
      .success,
  ).toBe(true)
  expect(StepSchema.safeParse({ name: 'gate', instructions: 'run bun test' }).success).toBe(true)
  expect(
    StepSchema.safeParse({ name: 'big', use: { type: 'agent', name: 'x' }, execute: 'workflow' })
      .success,
  ).toBe(true)
  expect(StepSchema.safeParse({ name: 'x', run: 'bun test' }).success).toBe(false) // run is gone
  expect(StepSchema.safeParse({ name: 'x', use: { type: 'agent' } }).success).toBe(false) // name required
  expect(
    StepSchema.safeParse({
      name: 'walk',
      use: { type: 'skill', name: 'walk' },
      involve: 'high-only',
    }).success,
  ).toBe(true)
  expect(StepSchema.safeParse({ name: 'notwalk', involve: 'all' }).success).toBe(false)
})

test('ConfigSchema: tier blocks with build each/stop/retry; rejects an unknown top-level key', () => {
  const ok = ConfigSchema.safeParse({
    task: {
      build: {
        steps: [{ name: 'implement', use: { type: 'agent', name: 'build-implement' } }],
        each: 'phase',
        retry_limit: 3,
      },
    },
  })
  expect(ok.success).toBe(true)
  expect(ConfigSchema.safeParse({ task: { build: { retry_limit: 99 } } }).success).toBe(false) // > 20
  expect(ConfigSchema.safeParse({ bogus: {} }).success).toBe(false)
  expect(ConfigSchema.safeParse({}).success).toBe(true) // empty = zero-delta
})
