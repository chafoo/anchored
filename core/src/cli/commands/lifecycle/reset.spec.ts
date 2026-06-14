import { test, expect } from 'bun:test'
import { resetCommand } from './reset.js'
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

// a1 — success: read-then-reset, result echoes { slug, reset: true }
test('reset removes the node and returns { slug, reset }', async () => {
  const seen: string[] = []
  const d = deps({
    nodeOps: fakeFacade({
      reset: async (slug) => {
        seen.push(slug)
        return { slug, reset: true }
      },
    }),
  })
  const r = (await resetCommand(['my-task'], d)) as { slug: string; reset: boolean }
  expect(seen).toEqual(['my-task'])
  expect(r).toEqual({ slug: 'my-task', reset: true })
})

// a2 — missing slug → MissingArgument, NO read/reset touch
test('reset without a slug throws MissingArgument and touches nothing', async () => {
  let touched = false
  const d = deps({
    nodeOps: fakeFacade({
      read: async (s) => {
        touched = true
        return { slug: s }
      },
      reset: async (s) => {
        touched = true
        return { slug: s, reset: true }
      },
    }),
  })
  await expect(resetCommand([], d)).rejects.toMatchObject({ name: 'MissingArgument' })
  expect(touched).toBe(false)
})

// a3 — existence check runs FIRST: a read miss → UnknownNode, reset never called
test('reset maps a read miss to UnknownNode before any file delete', async () => {
  let removed = false
  const d = deps({
    nodeOps: fakeFacade({
      read: async () => {
        throw new Error('ENOENT')
      },
      reset: async (s) => {
        removed = true
        return { slug: s, reset: true }
      },
    }),
  })
  await expect(resetCommand(['ghost'], d)).rejects.toMatchObject({ name: 'UnknownNode' })
  expect(removed).toBe(false)
})
