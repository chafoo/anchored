import { test, expect } from 'bun:test'
import type { Tier } from './tier.js'

// conformance: a tier factory's OUTPUT — run(verb,args) + verbs() + get(slug).
test('a Tier exposes run / verbs / get', async () => {
  const node = { slug: 'e1', status: 'plan' }
  const epic: Tier = {
    tier: 'epic',
    verbs: () => ['get', 'status', 'child-add', 'roll-up'],
    get: async () => node,
    run: async (verb, args) => {
      if (verb === 'get') return node
      if (verb === 'status') return { ...node, status: args[0] }
      throw new Error(`unknown verb ${verb}`)
    },
  }

  expect(epic.tier).toBe('epic')
  expect(epic.verbs()).toContain('roll-up')
  expect(await epic.get('e1')).toEqual(node)
  expect(await epic.run('status', ['drafted'])).toEqual({ slug: 'e1', status: 'drafted' })
})
