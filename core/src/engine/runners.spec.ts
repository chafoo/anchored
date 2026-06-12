import { test, expect } from 'bun:test'
import { createStageRunner } from './stage-runner.js'
import { createTierRunner } from './tier-runner.js'
import { createEngine } from './engine.js'
import type { RunnerDeps, AnyNode, OpsLike, TierCfg } from './step-runner.js'

const noopOps: OpsLike = {
  setStatus: async (n) => n,
  nextChild: () => null,
  addQuestion: async (n) => n,
  resolveQuestion: async (n) => n,
  appendLog: async (n) => n,
  setChildStatus: async (n) => n,
  setField: async (n) => n,
}

function makeDeps(recorded: string[]): RunnerDeps {
  return {
    run: async (cmd) => {
      recorded.push(cmd)
      return { code: 0, stdout: cmd, stderr: '' }
    },
    spawn: { run: async () => ({ ok: true, kind: 'fake', evidence: ['ev'] }) },
    ops: noopOps,
    descriptorFor: () => ({ childTier: undefined }),
    runChildTier: async (_t: string, n: AnyNode) => ({ node: n, status: 'ok' as const }),
  }
}

const node: AnyNode = { slug: 'n', status: 'pending' }

// a1 — stage runs its steps in order
test('stage-runner runs steps in declared order', async () => {
  const rec: string[] = []
  const sr = createStageRunner({}, makeDeps(rec))
  await sr.run(
    'build',
    [
      { name: 's1', run: 'ONE' },
      { name: 's2', run: 'TWO' },
    ],
    node,
    'phase',
  )
  expect(rec).toEqual(['ONE', 'TWO'])
})

// a2 — tier runs plan→refine→build→wrap in order
test('tier-runner runs stages plan→refine→build→wrap', async () => {
  const rec: string[] = []
  const cfg: TierCfg = {
    plan: { steps: [{ name: 'p', run: 'PLAN' }] },
    refine: { steps: [{ name: 'r', run: 'REFINE' }] },
    build: { steps: [{ name: 'b', run: 'BUILD' }] },
    wrap: { steps: [{ name: 'w', run: 'WRAP' }] },
  }
  await createTierRunner('phase', cfg, makeDeps(rec)).run(node)
  expect(rec).toEqual(['PLAN', 'REFINE', 'BUILD', 'WRAP'])
})

// a3 — the SAME createTierRunner serves phase/task/epic (cfg-only difference)
test('one createTierRunner serves phase/task/epic', async () => {
  for (const tier of ['phase', 'task', 'epic']) {
    const rec: string[] = []
    const cfg: TierCfg = { plan: { steps: [{ name: 'x', run: tier.toUpperCase() }] } }
    await createTierRunner(tier, cfg, makeDeps(rec)).run(node)
    expect(rec).toEqual([tier.toUpperCase()])
  }
})

// a5 — createEngine runs a phase node end-to-end
test('createEngine runs a node end-to-end via the tier cfg', async () => {
  const rec: string[] = []
  const engine = createEngine({
    config: { phase: { build: { steps: [{ name: 'impl', run: 'IMPL' }] } } },
    ...makeDeps(rec),
    descriptorFor: () => ({ childTier: undefined }),
  })
  const r = await engine.run('phase', node)
  expect(r.status).toBe('ok')
  expect(rec).toEqual(['IMPL'])
})
