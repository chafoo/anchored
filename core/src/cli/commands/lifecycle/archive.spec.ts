import { test, expect } from 'bun:test'
import { archiveCommand } from './archive.js'
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

// a1 — success: read-then-archive, result echoes slug + the facade's `to`
test('archive moves the node and returns { slug, archived, to }', async () => {
  const seen: string[] = []
  const d = deps({
    nodeOps: fakeFacade({
      archive: async (slug) => {
        seen.push(slug)
        return { slug, to: 'archive/my-task' }
      },
    }),
  })
  const r = (await archiveCommand(['my-task'], d)) as {
    slug: string
    archived: boolean
    to: string
  }
  expect(seen).toEqual(['my-task'])
  expect(r).toEqual({ slug: 'my-task', archived: true, to: 'archive/my-task' })
})

// a2 — missing slug → MissingArgument, NO read/archive touch
test('archive without a slug throws MissingArgument and touches nothing', async () => {
  let touched = false
  const d = deps({
    nodeOps: fakeFacade({
      read: async (s) => {
        touched = true
        return { slug: s }
      },
      archive: async (s) => {
        touched = true
        return { slug: s, archived: true }
      },
    }),
  })
  await expect(archiveCommand([], d)).rejects.toMatchObject({ name: 'MissingArgument' })
  expect(touched).toBe(false)
})

// a3 — existence check runs FIRST: a read miss → UnknownNode, archive never called
test('archive maps a read miss to UnknownNode before any file move', async () => {
  let archived = false
  const d = deps({
    nodeOps: fakeFacade({
      read: async () => {
        throw new Error('ENOENT')
      },
      archive: async (s) => {
        archived = true
        return { slug: s, archived: true }
      },
    }),
  })
  await expect(archiveCommand(['ghost'], d)).rejects.toMatchObject({ name: 'UnknownNode' })
  expect(archived).toBe(false)
})
