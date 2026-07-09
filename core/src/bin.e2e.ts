// bin.e2e.ts — the version seam. `bin.ts` inlines VERSION so the bundled binary needs no
// package.json at runtime; the price is a constant that can silently drift from the one the
// package publishes. This test is the gate that makes the drift impossible: it reads both
// off the real filesystem (hence e2e) and refuses a mismatch. bin.ts itself is never
// imported — it is an entry point with top-level effects.
import { test, expect } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

test('the CLI version matches the version the package publishes', async () => {
  const source = await readFile(join(import.meta.dir, 'bin.ts'), 'utf8')
  const inlined = /const VERSION = '([^']+)'/.exec(source)?.[1]
  const published = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version

  expect(inlined).toBeDefined()
  expect(inlined).toBe(published)
})
