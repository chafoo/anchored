import { test, expect } from 'bun:test'
import type { Node, Schema, StorePort } from './store.js'

// conformance: an in-memory StorePort satisfies the contract — read validates, write is
// fail-closed (schema throws ⇒ nothing persisted), list returns slugs.
test('an in-memory StorePort conforms', async () => {
  const runs = new Map<string, Node>()
  const store: StorePort = {
    read: async (slug, schema) => schema.parse(runs.get(slug)) as Node,
    write: async (slug, node, schema) => {
      const parsed = schema.parse(node) as Node
      runs.set(slug, parsed)
      return parsed
    },
    list: async () => [...runs.keys()],
  }
  const pass: Schema = { parse: (x) => x }
  const reject: Schema = {
    parse: () => {
      throw new Error('invalid')
    },
  }

  await store.write('r1', { goal: 'g' }, pass)
  expect(await store.read('r1', pass)).toEqual({ goal: 'g' })
  expect(await store.list()).toEqual(['r1'])
  expect(store.write('r2', { bad: true }, reject)).rejects.toThrow('invalid')
  expect(await store.list()).toEqual(['r1'])
})
