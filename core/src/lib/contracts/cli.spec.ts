import { test, expect } from 'bun:test'
import type { Cli } from './cli.js'

// conformance: a minimal Cli satisfies the contract — argv in, exit code out.
test('a minimal Cli conforms', async () => {
  const cli: Cli = { run: async (argv) => (argv.length > 0 ? 0 : 2) }
  expect(await cli.run(['status'])).toBe(0)
  expect(await cli.run([])).toBe(2)
})
