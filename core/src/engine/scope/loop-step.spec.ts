import { test, expect } from 'bun:test'
import { loopStep, stopCheck, routeStopVerdict } from './loop-step.js'
import { nextChild as realNextChild } from '../../ops/scope/children.js'
import type { AnyNode, OpsLike, RunnerDeps, StepResult } from '../step-runner.js'

const ctx = { tier: 'task', stage: 'build' }

function makeOps(rec?: { setChild: [string, string][]; questions: unknown[] }): OpsLike {
  return {
    setStatus: async (n) => n,
    nextChild: (n) => {
      const children = (n.phases ?? n.tasks ?? []) as {
        slug: string
        status: string
        depends_on?: string[]
      }[]
      return realNextChild(children)
    },
    setChildStatus: async (n, slug, status) => {
      rec?.setChild.push([slug, status])
      const field = n.phases ? 'phases' : 'tasks'
      const children = ((n[field] as { slug: string }[]) ?? []).map((c) =>
        c.slug === slug ? { ...c, status } : c,
      )
      return { ...n, [field]: children }
    },
    addQuestion: async (n, init) => {
      rec?.questions.push(init)
      return n
    },
    resolveQuestion: async (n) => n,
    appendLog: async (n) => n,
    setField: async (n) => n,
  }
}

function makeDeps(over: Partial<RunnerDeps>): RunnerDeps {
  return {
    run: async (cmd) => ({ code: 0, stdout: cmd, stderr: '' }),
    spawn: { run: async () => ({ ok: true, kind: 'fake' }) },
    ops: makeOps(),
    descriptorFor: () => ({ childTier: 'phase' }),
    runChildTier: async (_t: string, n: AnyNode) => ({ node: n, status: 'ok' as const }),
    ...over,
  }
}

// a1 — interleaved body: A.s1,A.s2,B.s1,B.s2 (not s1A,s1B,s2A,s2B)
test('sequential loop runs the body INTERLEAVED per child', async () => {
  const rec: string[] = []
  const node: AnyNode = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'A', status: 'pending' },
      { slug: 'B', status: 'pending' },
    ],
  }
  const deps = makeDeps({
    run: async (cmd) => {
      rec.push(cmd)
      return { code: 0, stdout: '', stderr: '' }
    },
    ops: makeOps({ setChild: [], questions: [] }),
  })
  await loopStep(
    {
      name: 'loop',
      each: 'phase',
      steps: [
        { name: 's1', run: 'S1' },
        { name: 's2', run: 'S2' },
      ],
    },
    node,
    ctx,
    { build: {} },
    deps,
  )
  expect(rec).toEqual(['S1', 'S2', 'S1', 'S2'])
})

// a2/a7 — recursion: runChildTier(childTier) per child; same code both edges
test('loop calls runChildTier of the child tier (task→phase and epic→task)', async () => {
  for (const [childTier, field] of [
    ['phase', 'phases'],
    ['task', 'tasks'],
  ] as const) {
    const seen: string[] = []
    const node: AnyNode = {
      slug: 'n',
      status: 'build',
      [field]: [{ slug: 'c1', status: 'pending' }],
    }
    const deps = makeDeps({
      runChildTier: async (t: string, n: AnyNode) => {
        seen.push(t)
        return { node: n, status: 'ok' as const }
      },
      ops: makeOps({ setChild: [], questions: [] }),
    })
    await loopStep({ name: 'loop', each: childTier }, node, ctx, { build: {} }, deps)
    expect(seen).toEqual([childTier])
  }
})

// a3 — shorthand implicit body [run]: exactly the run built-in per child
test('loop with no body uses implicit [run] built-in per child', async () => {
  let runs = 0
  const node: AnyNode = { slug: 't', status: 'build', phases: [{ slug: 'A', status: 'pending' }] }
  const deps = makeDeps({
    runChildTier: async (_t: string, n: AnyNode) => {
      runs++
      return { node: n, status: 'ok' as const }
    },
    ops: makeOps({ setChild: [], questions: [] }),
  })
  await loopStep({ name: 'loop', each: 'phase' }, node, ctx, { build: {} }, deps)
  expect(runs).toBe(1)
})

// a4 — advance via ops.setChildStatus per iteration
test('loop advances child status through ops', async () => {
  const rec = { setChild: [] as [string, string][], questions: [] as unknown[] }
  const node: AnyNode = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'A', status: 'pending' },
      { slug: 'B', status: 'pending' },
    ],
  }
  await loopStep(
    { name: 'loop', each: 'phase' },
    node,
    ctx,
    { build: {} },
    makeDeps({ ops: makeOps(rec) }),
  )
  expect(rec.setChild).toEqual([
    ['A', 'done'],
    ['B', 'done'],
  ])
})

// a5 — retry to retry_limit then halt
test('loop retries a failing child up to retry_limit then halts', async () => {
  let attempts = 0
  const node: AnyNode = { slug: 't', status: 'build', phases: [{ slug: 'A', status: 'pending' }] }
  const flaky = makeDeps({
    runChildTier: async (_t: string, n: AnyNode) => {
      attempts++
      return { node: n, status: (attempts >= 3 ? 'ok' : 'failed') as 'ok' | 'failed' }
    },
    ops: makeOps({ setChild: [], questions: [] }),
  })
  const r1 = await loopStep(
    { name: 'loop', each: 'phase' },
    node,
    ctx,
    { build: { retry_limit: 3 } },
    flaky,
  )
  expect(attempts).toBe(3)
  expect(r1.status).toBe('ok')

  let alwaysFail = 0
  const dead = makeDeps({
    runChildTier: async (_t: string, n: AnyNode): Promise<StepResult> => {
      alwaysFail++
      return { node: n, status: 'failed' }
    },
    ops: makeOps({ setChild: [], questions: [] }),
  })
  const r2 = await loopStep(
    { name: 'loop', each: 'phase' },
    node,
    ctx,
    { build: { retry_limit: 3 } },
    dead,
  )
  expect(alwaysFail).toBe(3)
  expect(r2.status).toBe('failed')
})

// a6 — stopCheck pure + routeStopVerdict routes to ops (STOP→question, PROCEED→log)
test('stopCheck + routeStopVerdict route to ops', async () => {
  expect(stopCheck('a decision deviates from the plan', ['a decision deviates'])).toBe('STOP')
  expect(stopCheck('routine work', ['architectural boundary'])).toBe('PROCEED')
  const rec = { setChild: [] as [string, string][], questions: [] as unknown[] }
  const deps = makeDeps({ ops: makeOps(rec) })
  const stop = await routeStopVerdict(
    { slug: 'n', status: 'build' },
    'a decision deviates',
    ['a decision deviates'],
    deps,
  )
  expect(stop.verdict).toBe('STOP')
  expect(rec.questions.length).toBe(1)
})
