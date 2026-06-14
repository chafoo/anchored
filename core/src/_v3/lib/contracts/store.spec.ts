import { test, expect } from 'bun:test'
import type { StorePort, Node, Schema } from './store.js'

// conformance: a dumb in-memory StorePort — read/write validate against the GIVEN schema,
// it knows nothing about what's in the node.
test('an in-memory StorePort validates by the given schema, archives + removes', async () => {
  const disk = new Map<string, Node>([['t', { slug: 't', status: 'plan' }]])
  const schema: Schema = { parse: (x) => x }
  const store: StorePort = {
    read: async (slug, s) => s.parse(disk.get(slug)) as Node,
    write: async (slug, node, s) => {
      s.parse(node)
      disk.set(slug, node)
      return node
    },
    archive: async (slug) => void disk.delete(slug),
    remove: async (slug) => void disk.delete(slug),
  }

  expect((await store.read('t', schema)).status).toBe('plan')
  const out = await store.write('t', { slug: 't', status: 'drafted' }, schema)
  expect(out.status).toBe('drafted')
  await store.archive('t')
  expect(disk.has('t')).toBe(false)
})
