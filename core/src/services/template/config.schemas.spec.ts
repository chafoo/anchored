import { test, expect } from 'bun:test'
import { StepSchema, ConfigSchema } from './config.schemas.js'

test('StepSchema: inline worker ok; worker+run rejected; type needs worker; involve only on walk', () => {
  expect(
    StepSchema.safeParse({ name: 'implement', worker: 'build-implement', type: 'agent' }).success,
  ).toBe(true)
  expect(StepSchema.safeParse({ name: 'gate', run: 'bun test' }).success).toBe(true)
  expect(StepSchema.safeParse({ name: 'x', worker: 'a', run: 'b' }).success).toBe(false)
  expect(StepSchema.safeParse({ name: 'x', type: 'agent' }).success).toBe(false) // type without worker
  expect(
    StepSchema.safeParse({ name: 'walk', worker: 'walk', type: 'skill', involve: 'high-only' })
      .success,
  ).toBe(true)
  expect(StepSchema.safeParse({ name: 'notwalk', involve: 'all' }).success).toBe(false)
})

test('ConfigSchema: tier blocks with build each/stop/retry; rejects an unknown top-level key', () => {
  const ok = ConfigSchema.safeParse({
    task: {
      build: {
        steps: [{ name: 'implement', worker: 'build-implement' }],
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
