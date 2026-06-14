import { test, expect } from 'bun:test'
import { requireNode } from './require-node.js'
import type { CliDeps } from '../../cli.js'
import { fakeFacade } from '../../cli.spec.js'

function deps(over: Partial<CliDeps> = {}): CliDeps {
  return {
    nodeOps: fakeFacade(),
    tierFor: () => 'task',
    out: () => {},
    ...over,
  }
}

// a1 — node exists → resolves void, read is hit with the slug
test('requireNode resolves when the node reads cleanly', async () => {
  const seen: string[] = []
  const d = deps({
    nodeOps: fakeFacade({
      read: async (slug) => {
        seen.push(slug)
        return { slug, status: 'plan' }
      },
    }),
  })
  await expect(requireNode(d, 'my-task')).resolves.toBeUndefined()
  expect(seen).toEqual(['my-task'])
})

// a2 — a raw read miss (ENOENT, name 'Error') is mapped to a typed UnknownNode
test('requireNode maps a raw read miss to UnknownNode with suggestions', async () => {
  const d = deps({
    nodeOps: fakeFacade({
      read: async () => {
        throw new Error('ENOENT: no such file')
      },
    }),
  })
  await expect(requireNode(d, 'ghost')).rejects.toMatchObject({
    name: 'UnknownNode',
    message: "no node 'ghost' to operate on",
    suggestions: ['check the slug — nothing was archived/reset'],
  })
})

// a3 — an already-typed substrate error is preserved, NOT re-wrapped
test('requireNode keeps an existing typed substrate error', async () => {
  const typed = Object.assign(new Error('node is locked'), { name: 'NodeLocked' })
  const d = deps({
    nodeOps: fakeFacade({
      read: async () => {
        throw typed
      },
    }),
  })
  await expect(requireNode(d, 'x')).rejects.toBe(typed)
})
