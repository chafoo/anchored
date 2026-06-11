import { test, expect } from 'bun:test'
import { createNodeOps, type NodeOpsDeps, type TierDescriptor } from './node-ops.js'
import { phaseDescriptor } from '../schema/tiers/phase.js'
import { taskDescriptor } from '../schema/tiers/task.js'
import { epicDescriptor } from '../schema/tiers/epic.js'

function makeDeps() {
  const store = new Map<string, string>()
  const deps: NodeOpsDeps = {
    io: {
      async atomicWrite(path: string, content: string) {
        store.set(path, content)
      },
      async readFile(path: string) {
        return store.get(path) ?? ''
      },
    },
    render: (n) => JSON.stringify(n),
    parse: (r) => JSON.parse(r),
    pathFor: (s) => s,
  }
  return deps
}

// a1 — ONE createNodeOps serves phase, task and epic through the same core verbs
test('same createNodeOps serves phase/task/epic descriptors', async () => {
  for (const desc of [phaseDescriptor, taskDescriptor, epicDescriptor] as TierDescriptor[]) {
    const ops = createNodeOps(desc, makeDeps())
    // create now validates the full tier schema before write (G1) → a complete,
    // schema-valid node per tier (phase needs name; task/epic need schema_version + title)
    const created = await ops.create(completeNodeFor(desc))
    expect(created.slug).toBe('n')
    const read = await ops.read('n')
    expect(read.slug).toBe('n')
  }
})

function completeNodeFor(desc: TierDescriptor): {
  slug: string
  status: string
  [k: string]: unknown
} {
  const status = desc.statusEnum[0]!
  if (desc.tier === 'phase') return { name: 'N', slug: 'n', status }
  return { schema_version: 2, slug: 'n', title: 'N', status } // task + epic
}

// a2 — next-child works over the per-tier child list (task→phases, epic→tasks)
test('next-child uses the per-tier child field', () => {
  const taskOps = createNodeOps(taskDescriptor, makeDeps())
  const taskNode = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'p1', status: 'done' },
      { slug: 'p2', status: 'pending' },
    ],
  }
  expect(taskOps.nextChild(taskNode)?.slug).toBe('p2')

  const epicOps = createNodeOps(epicDescriptor, makeDeps())
  const epicNode = {
    slug: 'e',
    status: 'build',
    tasks: [
      { slug: 't1', status: 'done' },
      { slug: 't2', status: 'pending', depends_on: ['t1'] },
    ],
  }
  expect(epicOps.nextChild(epicNode)?.slug).toBe('t2')
})
