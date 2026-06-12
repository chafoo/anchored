import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { ConfigSchema, parseConfig, safeParseConfig } from './config.js'

// a1 — parses the FULL shipped anchored.default.yml
test('config parses the full anchored.default.yml', () => {
  const raw = readFileSync(
    new URL('../../default-template/anchored.default.yml', import.meta.url),
    'utf8',
  )
  const data = parseYaml(raw)
  const r = safeParseConfig(data)
  if (!r.ok) console.error(JSON.stringify(r.error.issues, null, 2))
  expect(r.ok).toBe(true)
})

// a2 — a near-empty / single-delta user config is valid
test('config: empty and single-delta user configs are valid', () => {
  expect(ConfigSchema.safeParse({}).success).toBe(true)
  const delta = {
    phase: { build: { steps: [{ name: 'lint', run: 'eslint .', after: 'implement' }] } },
  }
  expect(ConfigSchema.safeParse(delta).success).toBe(true)
})

// a3 — each only in build; retry_limit constraints
test('config: each only in build; retry_limit must be int>=1', () => {
  expect(ConfigSchema.safeParse({ task: { build: { each: 'phase' } } }).success).toBe(true)
  expect(ConfigSchema.safeParse({ task: { plan: { each: 'phase' } } }).success).toBe(false)
  expect(ConfigSchema.safeParse({ task: { build: { retry_limit: 3 } } }).success).toBe(true)
  expect(ConfigSchema.safeParse({ task: { build: { retry_limit: 0 } } }).success).toBe(false)
  expect(ConfigSchema.safeParse({ task: { build: { retry_limit: 'x' } } }).success).toBe(false)
})

// a4 — _lib allowed; unknown top-level key rejected by strict
test('config: _lib allowed, unknown top-level key rejected', () => {
  expect(ConfigSchema.safeParse({ _lib: { anchor: { name: 'x', run: 'a' } } }).success).toBe(true)
  expect(ConfigSchema.safeParse({ bogus: 1 }).success).toBe(false)
})

// a5 — parseConfig/safeParseConfig are pure helpers
test('config: parse helpers', () => {
  expect(() => parseConfig({ bogus: 1 })).toThrow()
  expect(safeParseConfig({}).ok).toBe(true)
})

// Q4 (harden-1) — retry_limit is upper-bounded so a config can't request a runaway loop.
test('Q4: retry_limit above the cap is rejected', () => {
  expect(safeParseConfig({ task: { build: { each: 'phase', retry_limit: 1000000000 } } }).ok).toBe(
    false,
  )
  expect(safeParseConfig({ task: { build: { each: 'phase', retry_limit: 5 } } }).ok).toBe(true)
})
