import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { createBootstrap, type BootstrapDeps } from './bootstrap.js'
import { merge } from './merge.js'
import type { Config } from '../schema/config.js'

const defaultRaw = readFileSync(
  new URL('../../default-template/anchored.default.yml', import.meta.url),
  'utf8',
)

interface Stage {
  steps?: { name: string }[]
  each?: string
  stop?: string[]
  retry_limit?: number
}
type Cfg = Record<
  string,
  { plan?: Stage; refine?: Stage; build?: Stage; wrap?: Stage; fields?: unknown } | undefined
>

function deps(): BootstrapDeps {
  return {
    readDefault: () => defaultRaw,
    readUser: () => undefined,
    parseYaml: (raw) => parse(raw),
  }
}

// a1 — all three tiers with stages + fields
test('default.yml has phase/task/epic stages + fields', () => {
  const d = parse(defaultRaw) as Cfg
  for (const t of ['phase', 'task', 'epic']) {
    expect(d[t]?.build).toBeDefined()
    expect(d[t]?.fields).toBeDefined()
  }
})

// a2 — canonical phase.build sequence; task/epic build each + stop + retry_limit
test('phase.build sequence + task/epic each/stop/retry', () => {
  const d = parse(defaultRaw) as Cfg
  expect(d.phase?.build?.steps?.map((s) => s.name)).toEqual([
    'implement',
    'task-validate',
    'code-validate',
  ])
  expect(d.task?.build?.each).toBe('phase')
  expect(d.epic?.build?.each).toBe('task')
  expect(d.task?.build?.retry_limit).toBe(3)
  expect(d.task?.build?.stop?.length ?? 0).toBeGreaterThan(0)
})

// a3 — loader factory over an injected reader, validates against config schema
test('bootstrap.defaultConfig loads + validates via the injected reader', () => {
  const cfg = createBootstrap(deps()).defaultConfig() as Cfg
  expect(cfg.task?.build?.each).toBe('phase')
})

// a4 — minimal user (no tier blocks) ⇒ full default
test('minimal/missing user yields the full default', () => {
  const eff = createBootstrap(deps()).load('/proj') as Cfg
  expect(eff.phase?.build?.steps?.map((s) => s.name)).toEqual([
    'implement',
    'task-validate',
    'code-validate',
  ])
  expect(eff.task?.plan?.steps?.map((s) => s.name)).toEqual(['discover', 'rules-scan', 'decompose'])
  const merged = merge(createBootstrap(deps()).defaultConfig(), {} as Config) as Cfg
  expect(merged.epic?.plan?.steps?.length ?? 0).toBeGreaterThan(0)
})
