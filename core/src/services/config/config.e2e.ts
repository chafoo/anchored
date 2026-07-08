import { test, expect } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { createConfig } from './config.js'

// docs fidelity: the shipped example anchored.yml MUST load through the real config
// service — docs and code cannot drift apart. Real fs read → e2e by definition.
const example = join(import.meta.dir, '../../../../docs/examples/anchored.yml')

test('docs/examples/anchored.yml loads through createConfig', async () => {
  const config = createConfig(parse(await readFile(example, 'utf8')))
  expect(config.fields()).toEqual({ commit: 'string', coverage_pct: 'number' })
  expect(config.names().sort()).toEqual(['backend', 'docs', 'frontend', 'release'])
  const backend = config.resolve('backend')
  expect(backend.before?.instructions).toContain('typecheck')
  expect(backend.after?.instructions).toContain('anchored set')
  // defaults fill unclaimed slots on every setup
  expect(config.resolve('docs').validator?.instructions).toContain('links')
  expect(config.resolve('frontend').after).toBeUndefined()
})
