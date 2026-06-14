import { test, expect } from 'bun:test'
import { buildCommand } from './build.js'
import type { CliDeps } from '../../cli.js'
import type { StepPlan } from '../../../lib/contracts/config.js'
import { fakeFacade } from '../../cli.spec.js'

function makeDeps(over: Partial<CliDeps> = {}): CliDeps {
  return {
    nodeOps: fakeFacade(),
    tierFor: () => 'task',
    out: () => {},
    ...over,
  }
}

// a1 — returns the build-stage orchestration plan: stamps stage='build', the read
// node, the resolved tier, and the config-driven steps for tier×'build'
test('build returns the plan with stage=build, node, tier, resolved steps', async () => {
  const node = { slug: 'my-task', status: 'refined' }
  const seen: { tier: string; stage: string }[] = []
  const plan: StepPlan = { steps: [{ name: 'implement' }] } as StepPlan
  const deps = makeDeps({
    nodeOps: fakeFacade({ read: async () => node }),
    tierFor: () => 'task',
    steps: (tier, stage) => {
      seen.push({ tier, stage })
      return plan
    },
  })
  const r = (await buildCommand(['my-task'], deps)) as {
    stage: string
    tier: string
    node: unknown
    steps: unknown
  }
  expect(r.stage).toBe('build')
  expect(r.tier).toBe('task')
  expect(r.node).toEqual(node)
  expect(r.steps).toEqual(plan.steps)
  // steps resolver consulted with the build stage + tier from tierFor(node)
  expect(seen).toEqual([{ tier: 'task', stage: 'build' }])
})

// a2 — reads the slug through nodeOps and feeds that node into tierFor
test('build reads the slug and routes the read node through tierFor', async () => {
  const node = { slug: 'epic-x', status: 'refined' }
  let tierForArg: unknown
  const deps = makeDeps({
    nodeOps: fakeFacade({ read: async () => node }),
    tierFor: (n) => {
      tierForArg = n
      return 'epic'
    },
  })
  const r = (await buildCommand(['epic-x'], deps)) as { tier: string }
  expect(tierForArg).toEqual(node)
  expect(r.tier).toBe('epic')
})

// a3 — empty-steps fallback: no steps resolver wired → steps: []
test('build falls back to empty steps when no steps resolver is injected', async () => {
  const deps = makeDeps({ steps: undefined })
  const r = (await buildCommand(['my-task'], deps)) as { steps: unknown[] }
  expect(r.steps).toEqual([])
})

// a4 — missing slug → MissingArgument cliError, never touches nodeOps.read
test('build without a slug throws MissingArgument and skips the read', async () => {
  let readCalled = false
  const deps = makeDeps({
    nodeOps: fakeFacade({
      read: async (s) => {
        readCalled = true
        return { slug: s }
      },
    }),
  })
  await expect(buildCommand([], deps)).rejects.toMatchObject({ name: 'MissingArgument' })
  expect(readCalled).toBe(false)
})
