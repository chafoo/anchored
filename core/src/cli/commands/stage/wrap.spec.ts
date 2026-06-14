import { test, expect } from 'bun:test'
import { wrapCommand } from './wrap.js'
import type { CliDeps } from '../../cli.js'
import { fakeFacade } from '../../cli.spec.js'

// a1 — returns the wrap-stage plan: stage fixed to 'wrap', node read by slug,
// tier from tierFor, steps resolved for (tier, 'wrap').
test('wrap returns the wrap-stage plan with node + resolved steps', async () => {
  const node = { slug: 'my-task', status: 'build' }
  const seen: { tier: string; stage: string }[] = []
  const deps: CliDeps = {
    nodeOps: fakeFacade({ read: async () => node }),
    tierFor: () => 'task',
    steps: (tier, stage) => {
      seen.push({ tier, stage })
      return { tier, stage, steps: [{ name: 'review', kind: 'worker' }] }
    },
    out: () => {},
  }
  const r = (await wrapCommand(['my-task'], deps)) as {
    stage: string
    tier: string
    node: unknown
    steps: { name: string; kind: string }[]
  }
  expect(r.stage).toBe('wrap')
  expect(r.tier).toBe('task')
  expect(r.node).toBe(node)
  expect(r.steps).toEqual([{ name: 'review', kind: 'worker' }])
  // steps() was consulted for the wrap stage of the resolved tier
  expect(seen).toEqual([{ tier: 'task', stage: 'wrap' }])
})

// a2 — empty-steps fallback: no `steps` dep wired → steps defaults to []
test('wrap falls back to empty steps when no steps dep is wired', async () => {
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
    tierFor: () => 'epic',
    out: () => {},
  }
  const r = (await wrapCommand(['some-epic'], deps)) as { steps: unknown[]; tier: string }
  expect(r.steps).toEqual([])
  expect(r.tier).toBe('epic')
})

// a3 — missing slug → MissingArgument cliError, node never read
test('wrap without a slug throws MissingArgument and never reads', async () => {
  let read = false
  const deps: CliDeps = {
    nodeOps: fakeFacade({
      read: async (s) => {
        read = true
        return { slug: s }
      },
    }),
    tierFor: () => 'task',
    out: () => {},
  }
  await expect(wrapCommand([], deps)).rejects.toMatchObject({ name: 'MissingArgument' })
  expect(read).toBe(false)
})
