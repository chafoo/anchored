import { test, expect } from 'bun:test'
import { createCli, type CliDeps, type NodeOpsFacade } from './cli.js'

export function fakeFacade(over: Partial<NodeOpsFacade> = {}): NodeOpsFacade {
  return {
    create: async (slug) => ({ slug }),
    read: async (slug) => ({ slug, status: 'plan' }),
    setStatus: async (slug, status) => ({ slug, status }),
    addChild: async () => ({}),
    setChildField: async () => ({}),
    nextChild: async () => null,
    readyChildren: async () => [],
    addQuestion: async () => ({}),
    resolveQuestion: async () => ({}),
    addConcern: async () => ({}),
    resolveConcern: async () => ({}),
    appendLog: async () => ({}),
    setField: async () => ({}),
    setExecutor: async () => ({}),
    addEvidence: async () => ({}),
    addPhase: async () => ({}),
    addAc: async () => ({}),
    addChildEvidence: async () => ({}),
    setChildFailures: async () => ({}),
    clearChildFailures: async () => ({}),
    addAcceptance: async () => ({}),
    setAcceptanceStatus: async () => ({}),
    setChildAcStatus: async () => ({}),
    setPhaseRules: async () => ({}),
    setChildStatus: async () => ({}),
    archive: async (slug) => ({ slug, archived: true }),
    reset: async (slug) => ({ slug, reset: true }),
    ...over,
  }
}

function makeDeps(over: Partial<CliDeps> = {}): { deps: CliDeps; out: string[] } {
  const out: string[] = []
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
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

// a3 — unknown verb → ok:false, exit 1, no ops call
test('unknown verb → ok:false, exit 1, no ops call', async () => {
  let opsCalled = false
  const { deps, out } = makeDeps({
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

// L1a (harden-3) — `add-phase-evidence --run`: exit 0 writes evidence via the
// facade; non-zero is a loud GateFailed and writes NOTHING (AC stays un-evidenced).
test('L1a: --run writes evidence on exit 0, GateFailed on non-zero', async () => {
  const calls: string[] = []
  const facade = fakeFacade({
    addChildEvidence: async (_s, _p, _a, text) => {
      calls.push(text)
      return {}
    },
  })
  // exit 0 → evidence written
  const ok = makeDeps({
    nodeOps: facade,
    run: async () => ({ code: 0, stdout: 'PASS', stderr: '' }),
  })
  const c1 = await createCli(ok.deps).run([
    'node',
    'add-phase-evidence',
    's',
    'p',
    'a1',
    '--run',
    'npm test',
  ])
  expect(c1).toBe(0)
  expect(calls.length).toBe(1)
  expect(calls[0]).toContain('[verified-run exit 0] npm test')

  // exit 1 → GateFailed, no evidence
  const fail = makeDeps({
    nodeOps: facade,
    run: async () => ({ code: 1, stdout: '', stderr: '2 failing' }),
  })
  const c2 = await createCli(fail.deps).run([
    'node',
    'add-phase-evidence',
    's',
    'p',
    'a2',
    '--run',
    'npm test',
  ])
  expect(c2).toBe(1)
  expect(JSON.parse(fail.out[0]!).error.name).toBe('GateFailed')
  expect(calls.length).toBe(1) // unchanged — nothing written
})
