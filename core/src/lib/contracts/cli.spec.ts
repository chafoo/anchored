import { test, expect } from 'bun:test'
import type { Cli, Anchored } from './cli.js'
import type { TemplatePort } from './template.js'

// conformance: the root dispatcher + the assembled engine.
test('a Cli/Anchored conforms: run returns an exit code, Anchored carries the template', async () => {
  const template: TemplatePort = {
    steps: () => ({ tier: 'task', stage: 'build', steps: [] }),
    fields: () => ({}),
    validate: () => ({ ok: true }),
    raw: () => ({}),
  }
  const cli: Cli = { run: async (argv) => (argv.length > 0 ? 0 : 1) }
  const anchored: Anchored = { run: cli.run, template }

  expect(await cli.run(['task', 'get', 't1'])).toBe(0)
  expect(await cli.run([])).toBe(1)
  expect(anchored.template.raw()).toEqual({})
})
