import { test, expect } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { RunSchema } from './run.schemas.js'

// docs fidelity: the shipped example run file MUST parse against the real schema —
// docs and code cannot drift apart. Real fs read → e2e by definition.
const example = join(import.meta.dir, '../../../../docs/examples/fix-navbar.yml')

test('docs/examples/fix-navbar.yml parses against the run schema', async () => {
  const run = RunSchema.parse(parse(await readFile(example, 'utf8')))
  expect(run.goal).toContain('Navbar overflow')
  expect(run.plan).toContain('Accepted plan')
  expect(run.amendments[0]!.id).toBe('a1')
  const byId = new Map(run.criteria.map((c) => [c.id, c]))
  expect(byId.get('c1')!.status).toBe('done')
  expect(byId.get('c1')!.evidence?.by).toBe('validator')
  expect(byId.get('c2')!.status).toBe('superseded')
  expect(byId.get('c2')!.superseded_by).toBe('c5')
  expect(byId.get('c4')!.status).toBe('failed')
  expect(byId.get('c4')!.evidence?.verdict).toBeDefined()
  expect(run.trail.some((t) => t.validated !== undefined)).toBe(true)
})
