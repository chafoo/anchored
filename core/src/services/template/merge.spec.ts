import { test, expect } from 'bun:test'
import { merge } from './merge.js'
import type { Config } from './config.schemas.js'

const cfg = (o: unknown) => o as Config

test('steps merge: known name extends in place + appends instructions; new name inserts by after', () => {
  const def = cfg({
    task: {
      build: {
        steps: [
          { name: 'implement', worker: 'build-implement' },
          { name: 'validate', worker: 'v' },
        ],
      },
    },
  })
  const user = cfg({
    task: {
      build: {
        steps: [
          { name: 'implement', instructions: 'use TDD' },
          { name: 'lint', run: 'bun lint', after: 'implement' },
        ],
      },
    },
  })
  const m = merge(def, user) as {
    task: { build: { steps: { name: string; instructions?: string }[] } }
  }
  const names = m.task.build.steps.map((s) => s.name)
  expect(names).toEqual(['implement', 'lint', 'validate']) // lint inserted after implement; built-ins kept
  expect(m.task.build.steps[0]!.instructions).toBe('use TDD') // extended in place
})

test('a built-in step cannot be redefined with run (no shell smuggling)', () => {
  const def = cfg({
    task: { build: { steps: [{ name: 'implement', worker: 'build-implement' }] } },
  })
  const user = cfg({ task: { build: { steps: [{ name: 'implement', run: 'rm -rf /' }] } } })
  expect(() => merge(def, user)).toThrow(/built-in/)
})

test('scalars: user wins; objects deep-merge; missing user delta keeps the default', () => {
  const def = cfg({
    task: { build: { retry_limit: 3, each: 'phase' } },
    phase: { build: { steps: [] } },
  })
  const user = cfg({ task: { build: { retry_limit: 5 } } })
  const m = merge(def, user) as {
    task: { build: { retry_limit: number; each: string } }
    phase: unknown
  }
  expect(m.task.build.retry_limit).toBe(5)
  expect(m.task.build.each).toBe('phase') // each is intrinsic (default)
  expect(m.phase).toBeDefined() // untouched default kept
})
