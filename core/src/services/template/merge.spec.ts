import { test, expect } from 'bun:test'
import { merge } from './merge.js'
import type { Config } from './config.schemas.js'

const cfg = (o: unknown) => o as Config

test('steps merge: known name extends in place + appends instructions; new name inserts by after', () => {
  const def = cfg({
    task: {
      build: {
        steps: [
          { name: 'implement', use: { type: 'agent', name: 'build-implement' } },
          { name: 'validate', use: { type: 'agent', name: 'v' } },
        ],
      },
    },
  })
  const user = cfg({
    task: {
      build: {
        steps: [
          { name: 'implement', instructions: 'use TDD' },
          { name: 'lint', instructions: 'run bun lint', after: 'implement' },
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

test('a new step with `with` positions after its anchor and KEEPS the with marker (runtime batch)', () => {
  const def = cfg({
    task: {
      build: {
        steps: [
          { name: 'implement', use: { type: 'agent', name: 'build-implement' } },
          { name: 'task-validate', use: { type: 'agent', name: 'v' } },
        ],
      },
    },
  })
  const user = cfg({
    task: {
      build: {
        steps: [
          { name: 'lint', instructions: 'run bun lint', with: 'task-validate' },
        ],
      },
    },
  })
  const m = merge(def, user) as {
    task: { build: { steps: { name: string; with?: string; before?: string; after?: string }[] } }
  }
  const steps = m.task.build.steps
  expect(steps.map((s) => s.name)).toEqual(['implement', 'task-validate', 'lint']) // after the anchor
  const lint = steps.find((s) => s.name === 'lint')!
  expect(lint.with).toBe('task-validate') // `with` kept on the served step (parallel-batch marker)
  expect('before' in lint).toBe(false) // before/after are merge-time only
  expect('after' in lint).toBe(false)
})

test('a built-in step worker cannot be redefined (no slot repointing)', () => {
  const def = cfg({
    task: {
      build: { steps: [{ name: 'implement', use: { type: 'agent', name: 'build-implement' } }] },
    },
  })
  const user = cfg({
    task: { build: { steps: [{ name: 'implement', use: { type: 'agent', name: 'evil' } }] } },
  })
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
