import { test, expect } from 'bun:test'
import { parse as yamlParse } from 'yaml'
import { createTemplate, type TemplateDeps } from './template.js'

const DEFAULT = `
task:
  build:
    steps:
      - { name: implement, use: { type: agent, name: build-implement } }
      - { name: task-validate, use: { type: agent, name: build-task-validate } }
    each: phase
    stop: ["every acceptance criterion done"]
    retry_limit: 3
  fields:
    commit_sha: string
phase:
  build:
    steps:
      - { name: implement, use: { type: agent, name: build-implement } }
`

function makeTemplate(user?: string) {
  const deps: TemplateDeps = {
    readDefault: () => DEFAULT,
    readUser: () => user,
    parseYaml: (raw) => yamlParse(raw),
    projectRoot: '/p',
  }
  return createTemplate(deps)
}

// a1 — steps() serves the steps as DATA (worker inline), build carries the loop edge
test('steps() returns the inline-worker steps + the build loop edge', () => {
  const plan = makeTemplate().steps('task', 'build')
  expect(plan.steps.map((s) => s.name)).toEqual(['implement', 'task-validate'])
  expect(plan.steps[0]).toMatchObject({ use: { type: 'agent', name: 'build-implement' } })
  expect(plan.each).toBe('phase')
  expect(plan.retry_limit).toBe(3)
})

// a2 — a user delta merges (insert by after) without dropping the built-ins
test('a user anchored.yml delta extends the steps (keyed merge)', () => {
  const user = `
task:
  build:
    steps:
      - { name: lint, instructions: "run bun run lint", after: implement }
`
  const plan = makeTemplate(user).steps('task', 'build')
  expect(plan.steps.map((s) => s.name)).toEqual(['implement', 'lint', 'task-validate'])
})

// a3 — fields() serves the declared custom fields; validate() reports tier×stage resolution
test('fields() + validate()', () => {
  const t = makeTemplate()
  expect(t.fields('task')).toEqual({ commit_sha: 'string' })
  const v = t.validate() as { ok: boolean; tiers: Record<string, string[]> }
  expect(v.ok).toBe(true)
  expect(v.tiers.task).toContain('build')
  expect(t.raw()).toHaveProperty('task')
})

// a4 — a malformed anchored.yml is rejected with a ConfigError
test('an invalid anchored.yml throws ConfigError', () => {
  expect(() => makeTemplate('task:\n  build:\n    retry_limit: 999')).toThrow(
    /invalid anchored.yml/,
  )
})
