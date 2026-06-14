import { test, expect } from 'bun:test'
import type { StorePort, NodeGateway } from './store.js'
import type { Node, TierDescriptor } from './tier.js'

// contracts/store is interface-only — conformance spec pins the gateway surface:
// `for(descriptor)` binds a tier, `read`/`mutate` are the read + guarded
// read-modify-write the cli drives.
test('a1 — an in-memory StorePort conforms and mutate applies the transform', async () => {
  const nodes = new Map<string, Node>([['t', { slug: 't', status: 'plan' }]])
  const gateway: NodeGateway = {
    read: async (slug) => nodes.get(slug)!,
    mutate: async (slug, transform) => {
      const next = transform(nodes.get(slug)!)
      nodes.set(slug, next)
      return next
    },
  }
  const store: StorePort = { for: () => gateway }

  const desc = { tier: 'task' } as unknown as TierDescriptor
  const g = store.for(desc)
  expect((await g.read('t')).status).toBe('plan')
  const out = await g.mutate('t', (n) => ({ ...n, status: 'drafted' }))
  expect(out.status).toBe('drafted')
  expect((await g.read('t')).status).toBe('drafted')
})
