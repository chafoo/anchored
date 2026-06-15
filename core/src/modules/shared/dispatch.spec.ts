// _v3/modules/shared/dispatch.spec.ts — the shared tier dispatcher in isolation. Verifies the
// api.md two-token grammar: node verbs route as `<verb> <slug>`, collection ops as
// `<collection> <op> …`, `verbs()` lists both shapes, and the error envelopes (NoOp / UnknownOp
// / UnknownVerb) fire on the wrong shape.
import { test, expect } from 'bun:test'
import { dispatch, type Collections, type NodeVerbs } from './dispatch.js'

function make() {
  const calls: string[] = []
  const nodeVerbs: NodeVerbs = {
    get: async (slug) => {
      calls.push(`get:${slug}`)
      return { slug }
    },
    status: async (slug, to) => {
      calls.push(`status:${slug}:${to}`)
      return { slug, status: to }
    },
  }
  const collections: Collections = {
    ac: {
      add: async (slug, text) => {
        calls.push(`ac.add:${slug}:${text}`)
        return { slug, text }
      },
      done: async (slug, id) => {
        calls.push(`ac.done:${slug}:${id}`)
        return { slug, id }
      },
    },
  }
  const tier = dispatch('phase', nodeVerbs, collections, nodeVerbs.get!)
  return { tier, calls }
}

test('node verbs route as <verb> <slug> …', async () => {
  const { tier, calls } = make()
  await tier.run('status', ['s1', 'done'])
  expect(calls).toEqual(['status:s1:done'])
  expect(await tier.get('g1')).toEqual({ slug: 'g1' })
})

test('collection ops route as <collection> <op> <slug> …', async () => {
  const { tier, calls } = make()
  await tier.run('ac', ['add', 's1', 'a criterion'])
  await tier.run('ac', ['done', 's1', 'a1'])
  expect(calls).toEqual(['ac.add:s1:a criterion', 'ac.done:s1:a1'])
})

test('verbs() lists node verbs as one token and collection ops as two', () => {
  const { tier } = make()
  const v = tier.verbs()
  expect(v).toContain('get')
  expect(v).toContain('status')
  expect(v).toContain('ac add')
  expect(v).toContain('ac done')
})

test('the error envelopes fire on the wrong shape', async () => {
  const { tier } = make()
  await expect(tier.run('bogus', ['s1'])).rejects.toThrow(/has no verb 'bogus'/)
  await expect(tier.run('ac', [])).rejects.toThrow(/needs an op/)
  await expect(tier.run('ac', ['frobnicate', 's1'])).rejects.toThrow(/has no op 'frobnicate'/)
})
