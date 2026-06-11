import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { createResolveSteps } from './resolve-steps.js'
import { merge } from '../../config/merge.js'
import type { Config } from '../../schema/config.js'

const defaultCfg = parse(
  readFileSync(new URL('../../../default-template/anchored.default.yml', import.meta.url), 'utf8'),
) as Record<string, unknown>

// a1 — unoverridden stage → canonical default sequence
test('resolve(task, plan) returns the canonical default sequence', () => {
  expect(
    createResolveSteps(defaultCfg)
      .resolve('task', 'plan')
      .map((s) => s.name),
  ).toEqual(['discover', 'rules-scan', 'decompose'])
})

// a2 — default + custom mix keeps defaults in their canonical positions
test('custom steps merge with defaults keeping order', () => {
  const eff = merge(defaultCfg as Config, {
    phase: { build: { steps: [{ name: 'lint', run: 'eslint .', after: 'implement' }] } },
  }) as unknown as Record<string, unknown>
  expect(
    createResolveSteps(eff)
      .resolve('phase', 'build')
      .map((s) => s.name),
  ).toEqual(['implement', 'lint', 'task-validate', 'code-validate'])
})

// a3 — extend-only: an empty-override cannot remove a default step
test('extend-only: default steps survive an empty override', () => {
  const eff = merge(defaultCfg as Config, {
    phase: { build: { steps: [] } },
  }) as unknown as Record<string, unknown>
  const names = createResolveSteps(eff)
    .resolve('phase', 'build')
    .map((s) => s.name)
  expect(names).toContain('implement')
  expect(names).toContain('task-validate')
  expect(names).toContain('code-validate')
})

// a4 — task/epic build resolve to loop steps with implicit [run] body
test('resolve(task/epic, build) yields loop steps with implicit body', () => {
  const r = createResolveSteps(defaultCfg)
  const tb = r.resolve('task', 'build')
  expect(tb[0]?.each).toBe('phase')
  expect(tb[0]?.steps).toEqual([{ name: 'run' }])
  expect(r.resolve('epic', 'build')[0]?.each).toBe('task')
})
