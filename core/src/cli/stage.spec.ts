import { test, expect } from 'bun:test'
import { createCli, type CliDeps } from './cli.js'
import { fakeFacade } from './cli.spec.js'

const fakeSteps = (tier: string, stage: string) => ({
  tier,
  stage,
  steps: [{ name: 'implement', kind: 'worker' as const, agent: 'build-implement' }],
})

function setup(over: Partial<CliDeps> = {}) {
  const out: string[] = []
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
    tierFor: () => 'task',
    steps: fakeSteps,
    out: (l) => out.push(l),
    ...over,
  }
  return { deps, out }
}

// a1 — refine/build/wrap load node, derive tier, return the orchestration PLAN
// (node + resolved steps) — NO engine spawn (the skill orchestrates in-session)
test('stage verb loads node, derives tier, returns the plan (no engine spawn)', async () => {
  let reads = 0
  const node = { slug: 's', status: 'drafted' }
  const { deps, out } = setup({
    nodeOps: fakeFacade({
      read: async () => {
        reads++
        return node
      },
    }),
    tierFor: () => 'task',
  })
  const code = await createCli(deps).run(['build', 's'])
  expect(code).toBe(0)
  expect(reads).toBe(1)
  // the CLI returns the orchestration plan only — there is no engine to spawn
  const env = JSON.parse(out[0]!) as {
    ok: boolean
    result: { stage: string; tier: string; node: unknown; steps: unknown[] }
  }
  expect(env.ok).toBe(true)
  expect(env.result.stage).toBe('build')
  expect(env.result.tier).toBe('task')
  expect(env.result.node).toEqual(node)
  expect(env.result.steps).toHaveLength(1)
})

// a2 — plan <tier> <input> uses the explicit tier without classify
test('plan with explicit tier skips classify', async () => {
  let classified = false
  const { deps, out } = setup({
    classify: async () => {
      classified = true
      return { tier: 'epic' }
    },
  })
  await createCli(deps).run(['plan', 'task', 'add OAuth'])
  expect(classified).toBe(false)
  expect((JSON.parse(out[0]!) as { result: { tier: string } }).result.tier).toBe('task')
})

// a3 — plan without tier triggers classify, then proceeds with the recommendation
test('plan without tier routes through classify', async () => {
  let classifyCalls = 0
  const { deps, out } = setup({
    classify: async () => {
      classifyCalls++
      return { tier: 'epic', reasoning: 'many independent units' }
    },
  })
  await createCli(deps).run(['plan', 'build a whole subsystem'])
  expect(classifyCalls).toBe(1)
  expect((JSON.parse(out[0]!) as { result: { tier: string } }).result.tier).toBe('epic')
})

// a4 — plan result serialised on success (node + steps); nodeOps error → ok:false
test('stage result serialised; nodeOps error → ok:false', async () => {
  const ok = setup()
  await createCli(ok.deps).run(['refine', 's'])
  const env = JSON.parse(ok.out[0]!) as { result: { stage: string; steps: unknown[] } }
  expect(env.result.stage).toBe('refine')
  expect(env.result.steps).toHaveLength(1)

  const bad = setup({
    nodeOps: fakeFacade({
      read: async () => {
        throw Object.assign(new Error('no such slug'), { name: 'NotFound' })
      },
    }),
  })
  const code = await createCli(bad.deps).run(['refine', 'ghost'])
  expect(code).toBe(1)
  expect((JSON.parse(bad.out[0]!) as { ok: boolean }).ok).toBe(false)
})
