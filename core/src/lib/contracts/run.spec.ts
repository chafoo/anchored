import { test, expect } from 'bun:test'
import type { Node } from './store.js'
import type { RunPort, ValidationPacket } from './run.js'

// conformance: a minimal in-memory RunPort satisfies the 9-verb contract surface.
test('an in-memory RunPort conforms', async () => {
  const node: Node = { goal: 'g', criteria: [] }
  const packet: ValidationPacket = {
    slug: 'r1',
    snapshot: 'snap-t-1',
    rigor: 'standard',
    goal: 'g',
    criteria: [{ id: 'c1', text: 't', status: 'open' }],
    setup: {},
    fields: {},
  }
  const run: RunPort = {
    anchor: async () => node,
    claim: async () => node,
    amend: async () => node,
    validate: async () => packet,
    evidence: async () => node,
    fail: async () => node,
    set: async () => node,
    status: async () => node,
    list: async () => [
      { slug: 'r1', goal: 'g', rigor: 'standard', closed: false, open: 1, failed: 0, done: 0 },
    ],
    close: async () => node,
  }

  expect(await run.anchor({ slug: 'r1', goal: 'g', criteria: [{ text: 't' }] })).toBe(node)
  const p = await run.validate('r1', { gate: 'final' })
  expect(p.snapshot).toMatch(/^snap-/)
  expect(p.criteria[0]!.id).toBe('c1')
  expect((await run.list())[0]!.open).toBe(1)
  expect(await run.close('r1')).toBe(node)
})
