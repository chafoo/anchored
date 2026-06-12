import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { merge } from './merge.js'
import { ConfigSchema, type Config } from '../schema/config.js'

const defaultCfg = ConfigSchema.parse(
  parse(
    readFileSync(new URL('../../default-template/anchored.default.yml', import.meta.url), 'utf8'),
  ),
)

// a1 — merge is a pure function (no module-level effect)
test('merge is a pure function', () => {
  expect(typeof merge).toBe('function')
  expect(merge({}, {})).toEqual({})
})

// a2 — empty user ⇒ deep-equal default
test('empty user config yields the full default', () => {
  expect(merge(defaultCfg, {})).toEqual(defaultCfg)
})

// a3 — extend-only: additions land, omitted defaults stay
test('extend-only: user additions land, omitted defaults preserved', () => {
  const user: Config = {
    task: { wrap: { steps: [{ name: 'doc-sync', run: 'echo' }] } },
    phase: { fields: { customField: 'string' } },
  }
  const m = merge(defaultCfg, user)
  const wrapSteps = m.task?.wrap?.steps?.map((s) => s.name) ?? []
  expect(wrapSteps).toContain('review')
  expect(wrapSteps).toContain('summarize')
  expect(wrapSteps).toContain('doc-sync')
  expect(m.phase?.fields?.customField).toBe('string')
  expect(m.phase?.fields?.status).toBeDefined() // default field preserved
})

// a4 — scalar override wins; each stays intrinsic (default)
test('scalar override wins; each is intrinsic', () => {
  const m = merge(defaultCfg, { task: { build: { retry_limit: 5, each: 'task' } } })
  expect(m.task?.build?.retry_limit).toBe(5)
  expect(m.task?.build?.each).toBe('phase')
})

// a5 — steps keyed insert-merge with before/after; built-ins never drop
test('steps: before/after insert; known name extends in place', () => {
  const def: Config = {
    phase: {
      build: {
        steps: [{ name: 'implement' }, { name: 'task-validate' }, { name: 'code-validate' }],
      },
    },
  }
  const inserted = merge(def, {
    phase: { build: { steps: [{ name: 'lint', run: 'eslint .', after: 'implement' }] } },
  })
  expect(inserted.phase?.build?.steps?.map((s) => s.name)).toEqual([
    'implement',
    'lint',
    'task-validate',
    'code-validate',
  ])
  const extended = merge(def, {
    phase: { build: { steps: [{ name: 'task-validate', instructions: 'be strict' }] } },
  })
  expect(extended.phase?.build?.steps?.length).toBe(3) // no new entry
  expect(extended.phase?.build?.steps?.[1]?.instructions).toBe('be strict')
})

// a6 — stop union-append + dedupe (never replace)
test('stop: union-append with dedupe', () => {
  const def: Config = {
    task: { build: { each: 'phase', stop: ['a decision deviates'], retry_limit: 3 } },
  }
  const m = merge(def, { task: { build: { stop: ['custom stop', 'a decision deviates'] } } })
  expect(m.task?.build?.stop).toEqual(['a decision deviates', 'custom stop'])
})

// Q3 (harden-1) — a built-in WORKER cannot be redefined with run/use/each (that
// would smuggle arbitrary shell into the privileged implement slot).
test('Q3: redefining a built-in worker with run: is rejected (ConfigError)', () => {
  const def: Config = { phase: { build: { steps: [{ name: 'implement' }] } } } as Config
  expect(() =>
    merge(def, { phase: { build: { steps: [{ name: 'implement', run: 'rm -rf /' }] } } } as Config),
  ).toThrow(/built-in worker/)
  // extending the SAME worker with instructions stays allowed
  expect(() =>
    merge(def, {
      phase: { build: { steps: [{ name: 'implement', instructions: 'TDD' }] } },
    } as Config),
  ).not.toThrow()
})
