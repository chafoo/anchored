import { test, expect } from 'bun:test'
import type { Cli, Anchored } from './cli.js'
import type { ConfigPort } from './config.js'

// contracts/cli is interface-only — conformance spec pins the root dispatcher
// surface (run(argv) → exit code) and the assembled engine (cli + config).
test('a1 — an in-memory Cli/Anchored conforms and run returns an exit code', async () => {
  const config = {
    planFor: () => ({ tier: 'task', stage: 'build', steps: [] }),
    fields: () => ({}),
    raw: () => ({}),
  } satisfies ConfigPort

  const cli = { run: async (argv) => (argv.length > 0 ? 0 : 1) } satisfies Cli
  const anchored = { run: cli.run, config } satisfies Anchored

  expect(await cli.run(['plan', 'task', 'x'])).toBe(0)
  expect(await cli.run([])).toBe(1)
  expect(await anchored.run(['version'])).toBe(0)
  expect(anchored.config.raw()).toEqual({})
})
