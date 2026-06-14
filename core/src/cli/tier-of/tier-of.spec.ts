import { test, expect } from 'bun:test'
import { stringify } from 'yaml'
import { tierOfNode, makeTierFor } from './tier-of.js'

// tierOfNode — derive the tier from a node's child collection (in-memory)
test('tierOfNode derives tier from child collection', () => {
  expect(tierOfNode({ slug: 'p', status: 'plan', epics: [] })).toBe('project')
  expect(tierOfNode({ slug: 'e', status: 'plan', tasks: [] })).toBe('epic')
  expect(tierOfNode({ slug: 't', status: 'plan', phases: [] })).toBe('task')
  expect(tierOfNode({ slug: 'x', status: 'plan' })).toBe('task') // fallback
})

// makeTierFor — derive from the persisted FILE content (the SSOT), async via io
test('makeTierFor derives tier from persisted file shape', async () => {
  const files: Record<string, string> = {
    '/p.yml': stringify({ schema_version: 2, slug: 'p', title: 'P', status: 'plan', epics: [] }),
    '/e.yml': stringify({ schema_version: 2, slug: 'e', title: 'E', status: 'plan', tasks: [] }),
    '/t.yml': stringify({ schema_version: 2, slug: 't', title: 'T', status: 'plan', phases: [] }),
    '/leaf.yml': stringify({ name: 'L', slug: 'leaf', status: 'pending', acceptance_criteria: [] }),
  }
  const io = {
    readFile: (p: string) => {
      const c = files[p]
      if (c === undefined) return Promise.reject(new Error('missing'))
      return Promise.resolve(c)
    },
  }
  const tierFor = makeTierFor(io, (slug) => `/${slug}.yml`)
  expect(await tierFor('p')).toBe('project')
  expect(await tierFor('e')).toBe('epic')
  expect(await tierFor('t')).toBe('task')
  expect(await tierFor('leaf')).toBe('phase')
  expect(await tierFor('missing')).toBe('task') // unreadable → task fallback
})
