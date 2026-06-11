import { test, expect } from 'bun:test'
import { createCli, type CliDeps } from '../index.js'
import { fakeFacade } from '../index.spec.js'

function setup(over: Partial<CliDeps> = {}) {
  const out: string[] = []
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
    engine: { run: async (_t: string, node: unknown) => ({ node, status: 'ok' }) },
    tierFor: () => 'task',
    out: (l) => out.push(l),
    ...over,
  }
  return { deps, out }
}

// a1 — refine/build/wrap load node, derive tier, call engine.run once
test('stage verb loads node, derives tier, runs engine once', async () => {
  let runArgs: [string, unknown] | undefined
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
    engine: {
      run: async (t: string, n: unknown) => {
        runArgs = [t, n]
        return { node: n, status: 'ok' }
      },
    },
  })
  const code = await createCli(deps).run(['build', 's'])
  expect(code).toBe(0)
  expect(reads).toBe(1)
  expect(runArgs).toEqual(['task', node])
  expect((JSON.parse(out[0]!) as { ok: boolean }).ok).toBe(true)
})

// a2 — plan <tier> <input> runs engine.run(<tier>) without classify
test('plan with explicit tier skips classify', async () => {
  let classified = false
  let runTier = ''
  const { deps } = setup({
    classify: async () => {
      classified = true
      return { tier: 'epic' }
    },
    engine: {
      run: async (t: string, n: unknown) => {
        runTier = t
        return { node: n, status: 'ok' }
      },
    },
  })
  await createCli(deps).run(['plan', 'task', 'add OAuth'])
  expect(runTier).toBe('task')
  expect(classified).toBe(false)
})

// a3 — plan without tier triggers classify, then proceeds with the recommendation
test('plan without tier routes through classify', async () => {
  let classifyCalls = 0
  let runTier = ''
  const { deps, out } = setup({
    classify: async () => {
      classifyCalls++
      return { tier: 'epic', reasoning: 'many independent units' }
    },
    engine: {
      run: async (t: string, n: unknown) => {
        runTier = t
        return { node: n, status: 'ok' }
      },
    },
  })
  await createCli(deps).run(['plan', 'build a whole subsystem'])
  expect(classifyCalls).toBe(1)
  expect(runTier).toBe('epic')
  expect((JSON.parse(out[0]!) as { result: { tier: string } }).result.tier).toBe('epic')
})

// a4 — engine output serialised on success; nodeOps error → ok:false exit 1
test('engine result serialised; nodeOps error → ok:false', async () => {
  const ok = setup({
    engine: { run: async (_t: string, n: unknown) => ({ node: n, status: 'ok', evidence: ['e'] }) },
  })
  await createCli(ok.deps).run(['refine', 's'])
  expect((JSON.parse(ok.out[0]!) as { result: { status: string } }).result.status).toBe('ok')

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
