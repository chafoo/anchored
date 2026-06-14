import { test, expect } from 'bun:test'
import { refineCommand, runStage } from './refine.js'
import type { CliDeps } from '../../cli.js'
import { fakeFacade } from '../../cli.spec.js'

// a1 — returns the orchestration plan: stage + tier + read node + resolved steps
test('refineCommand returns stage/tier/node and the resolved steps', async () => {
  const node = { slug: 'my-task', status: 'drafted' }
  const stepsArgs: string[] = []
  const deps: CliDeps = {
    nodeOps: fakeFacade({ read: async () => node }),
    tierFor: () => 'task',
    steps: (tier, stage) => {
      stepsArgs.push(tier, stage)
      return { tier, stage, steps: [{ name: 'review', kind: 'worker' }] }
    },
    out: () => {},
  }
  const r = (await refineCommand(['my-task'], deps)) as {
    stage: string
    tier: string
    node: unknown
    steps: unknown[]
  }
  expect(r.stage).toBe('refine')
  expect(r.tier).toBe('task')
  expect(r.node).toEqual(node)
  expect(r.steps).toEqual([{ name: 'review', kind: 'worker' }])
  // tierFor's result is the tier handed to steps(), alongside the 'refine' stage
  expect(stepsArgs).toEqual(['task', 'refine'])
})

// a2 — missing slug → MissingArgument, the node is never read
test('refineCommand without a slug throws MissingArgument and never reads', async () => {
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
  await expect(refineCommand([], deps)).rejects.toMatchObject({ name: 'MissingArgument' })
  expect(read).toBe(false)
})

// a3 — no steps dep wired → empty-steps fallback ([]), not a crash
test('runStage falls back to empty steps when deps.steps is absent', async () => {
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
    tierFor: () => 'epic',
    out: () => {},
  }
  const r = (await runStage('wrap', ['some-slug'], deps)) as {
    stage: string
    tier: string
    steps: unknown[]
  }
  expect(r.stage).toBe('wrap')
  expect(r.tier).toBe('epic')
  expect(r.steps).toEqual([])
})
