import { test, expect } from 'bun:test'
import { createCli, type CliDeps, type NodeOpsFacade } from './index.js'

export function fakeFacade(over: Partial<NodeOpsFacade> = {}): NodeOpsFacade {
  return {
    create: async (slug) => ({ slug }),
    read: async (slug) => ({ slug, status: 'plan' }),
    setStatus: async (slug, status) => ({ slug, status }),
    addChild: async () => ({}),
    nextChild: async () => null,
    readyChildren: async () => [],
    addQuestion: async () => ({}),
    resolveQuestion: async () => ({}),
    appendLog: async () => ({}),
    setField: async () => ({}),
    setExecutor: async () => ({}),
    addEvidence: async () => ({}),
    addPhase: async () => ({}),
    addAc: async () => ({}),
    addChildEvidence: async () => ({}),
    setChildFailures: async () => ({}),
    setChildAcStatus: async () => ({}),
    setPhaseRules: async () => ({}),
    setChildStatus: async () => ({}),
    ...over,
  }
}

function makeDeps(over: Partial<CliDeps> = {}): { deps: CliDeps; out: string[] } {
  const out: string[] = []
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
    engine: { run: async (_t: string, node: unknown) => ({ node, status: 'ok' }) },
    tierFor: () => 'task',
    out: (line) => out.push(line),
    ...over,
  }
  return { deps, out }
}

// a2 — success → { ok:true, command, result }, exit 0
test('success dispatch emits ok:true envelope and exit 0', async () => {
  const { deps, out } = makeDeps()
  const code = await createCli(deps).run(['node', 'read', 'my-task'])
  expect(code).toBe(0)
  const env = JSON.parse(out[0]!) as { ok: boolean; command: string; result: unknown }
  expect(env.ok).toBe(true)
  expect(env.command).toBe('node')
})

// a3 — unknown verb → ok:false, exit 1, no engine/ops call
test('unknown verb → ok:false, exit 1, no engine/ops call', async () => {
  let engineCalled = false
  let opsCalled = false
  const { deps, out } = makeDeps({
    engine: {
      run: async (_t: string, n: unknown) => {
        engineCalled = true
        return { node: n, status: 'ok' }
      },
    },
    nodeOps: fakeFacade({
      read: async (s) => {
        opsCalled = true
        return { slug: s }
      },
    }),
  })
  const code = await createCli(deps).run(['bogus'])
  expect(code).toBe(1)
  expect((JSON.parse(out[0]!) as { ok: boolean }).ok).toBe(false)
  expect(engineCalled).toBe(false)
  expect(opsCalled).toBe(false)
})

// a4 — thrown handler error caught → ok:false, exit 1 (no crash/leak)
test('thrown handler error is caught and serialised', async () => {
  const { deps, out } = makeDeps({
    nodeOps: fakeFacade({
      read: async () => {
        throw new Error('boom')
      },
    }),
  })
  const code = await createCli(deps).run(['refine', 'my-task'])
  expect(code).toBe(1)
  const env = JSON.parse(out[0]!) as { ok: boolean; error: { message: string } }
  expect(env.ok).toBe(false)
  expect(env.error.message).toBe('boom')
})
