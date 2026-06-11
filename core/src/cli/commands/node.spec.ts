import { test, expect } from 'bun:test'
import { createCli, type CliDeps, type NodeOpsFacade } from '../index.js'
import { fakeFacade } from '../index.spec.js'

function spyFacade() {
  const calls: { verb: string; args: unknown[] }[] = []
  const rec =
    (verb: string) =>
    (...args: unknown[]): Promise<unknown> => {
      calls.push({ verb, args })
      return Promise.resolve({ verb, args })
    }
  const f = {
    create: rec('create'),
    read: rec('read'),
    setStatus: rec('setStatus'),
    addChild: rec('addChild'),
    nextChild: rec('nextChild'),
    addQuestion: rec('addQuestion'),
    resolveQuestion: rec('resolveQuestion'),
    appendLog: rec('appendLog'),
    setField: rec('setField'),
    setExecutor: rec('setExecutor'),
    addEvidence: rec('addEvidence'),
    addPhase: rec('addPhase'),
    addAc: rec('addAc'),
    addChildEvidence: rec('addChildEvidence'),
    setChildFailures: rec('setChildFailures'),
    setChildAcStatus: rec('setChildAcStatus'),
    setPhaseRules: rec('setPhaseRules'),
    setChildStatus: rec('setChildStatus'),
  } as unknown as NodeOpsFacade
  return { f, calls }
}

function deps(nodeOps: NodeOpsFacade): { deps: CliDeps; out: string[] } {
  const out: string[] = []
  return {
    deps: {
      nodeOps,
      engine: { run: async (_t: string, node: unknown) => ({ node, status: 'ok' }) },
      tierFor: () => 'task',
      out: (l) => out.push(l),
    },
    out,
  }
}

// a1 — each verb maps to exactly one nodeOps call with parsed args
test('node verb maps to one nodeOps call with parsed args', async () => {
  const { f, calls } = spyFacade()
  const { deps: d } = deps(f)
  await createCli(d).run(['node', 'set-status', 'my-task', 'drafted'])
  expect(calls).toEqual([{ verb: 'setStatus', args: ['my-task', 'drafted'] }])
})

// a2 — read returns the node as JSON in result (not YAML)
test('node read returns the node as JSON in result', async () => {
  const node = { slug: 'x', status: 'plan', title: 'T' }
  const { deps: d, out } = deps(fakeFacade({ read: async () => node }))
  await createCli(d).run(['node', 'read', 'x'])
  expect((JSON.parse(out[0]!) as { result: unknown }).result).toEqual(node)
})

// a3 — substrate invariant error rendered as ok:false (not re-checked in CLI)
test('node set-status surfaces the invariant error as ok:false', async () => {
  const err = Object.assign(new Error('cannot complete'), { name: 'IncompleteEvidence' })
  const { deps: d, out } = deps(
    fakeFacade({
      setStatus: async () => {
        throw err
      },
    }),
  )
  const code = await createCli(d).run(['node', 'set-status', 'x', 'done'])
  expect(code).toBe(1)
  expect((JSON.parse(out[0]!) as { error: { name: string } }).error.name).toBe('IncompleteEvidence')
})

// a4 — missing required arg → error envelope, no nodeOps call
test('node set-status without status → error, no ops call', async () => {
  const { f, calls } = spyFacade()
  const { deps: d, out } = deps(f)
  const code = await createCli(d).run(['node', 'set-status', 'x'])
  expect(code).toBe(1)
  expect((JSON.parse(out[0]!) as { error: { message: string } }).error.message).toMatch(/status/)
  expect(calls.length).toBe(0)
})

// workflow-mode set-executor-op a4 — set-executor maps to exactly one setExecutor call
test('node set-executor maps to one setExecutor call with parsed args', async () => {
  const { f, calls } = spyFacade()
  const { deps: d } = deps(f)
  await createCli(d).run(['node', 'set-executor', 'my-task', 'p1', 'workflow'])
  expect(calls).toEqual([{ verb: 'setExecutor', args: ['my-task', 'p1', 'workflow'] }])
})

// q6 verbs — add-phase / add-ac / add-phase-evidence each map to one ops call
test('node add-phase / add-ac / add-phase-evidence map to one ops call each', async () => {
  const { f, calls } = spyFacade()
  const { deps: d } = deps(f)
  const cli = createCli(d)
  await cli.run(['node', 'add-phase', 'my-task', 'p1', 'Phase 1'])
  await cli.run(['node', 'add-ac', 'my-task', 'p1', 'prove it'])
  await cli.run(['node', 'add-phase-evidence', 'my-task', 'p1', 'a1', 'src/x.ts:1 — proof'])
  await cli.run(['node', 'set-child-status', 'my-task', 'p1', 'done'])
  expect(calls).toEqual([
    { verb: 'addPhase', args: ['my-task', { slug: 'p1', name: 'Phase 1' }] },
    { verb: 'addAc', args: ['my-task', 'p1', { text: 'prove it' }] },
    { verb: 'addChildEvidence', args: ['my-task', 'p1', 'a1', 'src/x.ts:1 — proof'] },
    { verb: 'setChildStatus', args: ['my-task', 'p1', 'done'] },
  ])
})

// redo-loop-verbs F9 — set-failures / set-ac-status each map to one facade call
test('node set-failures / set-ac-status map to one facade call each', async () => {
  const { f, calls } = spyFacade()
  const { deps: d } = deps(f)
  const cli = createCli(d)
  await cli.run(['node', 'set-failures', 'my-task', 'p1', 'a1', 'gate: nicht erfüllt'])
  await cli.run(['node', 'set-ac-status', 'my-task', 'p1', 'a1', 'pending'])
  expect(calls).toEqual([
    { verb: 'setChildFailures', args: ['my-task', 'p1', 'a1', 'gate: nicht erfüllt'] },
    { verb: 'setChildAcStatus', args: ['my-task', 'p1', 'a1', 'pending'] },
  ])
})

// workflow-mode set-executor-op a4 — an invalid enum surfaces as ok:false / exit 1
test('node set-executor with an invalid enum → ok:false, exit 1', async () => {
  const err = Object.assign(new Error('executor must be one of implement | workflow'), {
    name: 'InvalidExecutor',
  })
  const { deps: d, out } = deps(
    fakeFacade({
      setExecutor: async () => {
        throw err
      },
    }),
  )
  const code = await createCli(d).run(['node', 'set-executor', 'x', 'p1', 'bogus'])
  expect(code).toBe(1)
  expect((JSON.parse(out[0]!) as { error: { name: string } }).error.name).toBe('InvalidExecutor')
})
