import { test, expect } from 'bun:test'
import { loopStep } from './scope/loop-step.js'
import { workflowLoop, selectWorker, isUnitComplete, partition } from './scope/loop-workflow.js'
import { nextChild as realNextChild } from '../ops/scope/children.js'
import type { AnyNode, MergedResult, OpsLike, RunnerDeps, WorkflowSeam } from './step-runner.js'

const ctx = { tier: 'task', stage: 'build' }

function makeOps(): OpsLike {
  return {
    setStatus: async (n) => n,
    nextChild: (n) =>
      realNextChild((n.phases ?? n.tasks ?? []) as { slug: string; status: string }[]),
    setChildStatus: async (n, slug, status) => {
      const field = n.phases ? 'phases' : 'tasks'
      const children = ((n[field] as { slug: string }[]) ?? []).map((c) =>
        c.slug === slug ? { ...c, status } : c,
      )
      return { ...n, [field]: children }
    },
    addQuestion: async (n) => n,
    resolveQuestion: async (n) => n,
    appendLog: async (n) => n,
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

const allDone = (parent: AnyNode, field = 'phases'): AnyNode => ({
  ...parent,
  [field]: ((parent[field] as AnyNode[]) ?? []).map((c) => ({
    ...c,
    status: 'done',
    acceptance_criteria: [{ id: 'a1', status: 'done', evidence: ['e'] }],
  })),
})

// ── pure helpers ──
test('selectWorker routes by executor (workflow → workflow, else implement)', () => {
  expect(selectWorker({ slug: 'a', status: 'pending', executor: 'workflow' })).toBe('workflow')
  expect(selectWorker({ slug: 'b', status: 'pending', executor: 'implement' })).toBe('implement')
  expect(selectWorker({ slug: 'c', status: 'pending' })).toBe('implement')
})

test('isUnitComplete: done status OR all ACs done-with-evidence', () => {
  expect(isUnitComplete({ slug: 'a', status: 'done' })).toBe(true)
  expect(
    isUnitComplete({
      slug: 'b',
      status: 'in-progress',
      acceptance_criteria: [{ status: 'done', evidence: ['x'] }],
    }),
  ).toBe(true)
  expect(
    isUnitComplete({
      slug: 'c',
      status: 'in-progress',
      acceptance_criteria: [{ status: 'done', evidence: [] }],
    }),
  ).toBe(false)
  expect(isUnitComplete({ slug: 'd', status: 'pending' })).toBe(false)
})

test('partition splits children into done vs failed/open by evidence', () => {
  const { done, failed } = partition([
    { slug: 'A', status: 'done' },
    { slug: 'B', status: 'in-progress', failures: ['boom'] },
  ])
  expect(done.map((c) => c.slug)).toEqual(['A'])
  expect(failed.map((c) => c.slug)).toEqual(['B'])
})

// ── workflow-dispatch-collect a1 — background dispatch, sequential body NOT run ──
test('a1: WORKFLOW mode dispatches children in background; sequential body does NOT run', async () => {
  const dispatched: string[][] = []
  let sequentialRan = false
  const node: AnyNode = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'A', status: 'pending' },
      { slug: 'B', status: 'pending' },
    ],
  }
  const seam: WorkflowSeam = {
    dispatch: async (units) => {
      dispatched.push(units.map((u) => u.child.slug))
    },
    collect: async (p) => allDone(p),
  }
  const deps = makeDeps({
    workflow: seam,
    runChildTier: async (_t, n) => {
      sequentialRan = true
      return { node: n, status: 'ok' as const }
    },
  })
  const r = await loopStep(
    { name: 'loop', each: 'phase' },
    node,
    ctx,
    { build: { mode: 'workflow' } },
    deps,
  )
  expect(dispatched).toEqual([['A', 'B']])
  expect(sequentialRan).toBe(false)
  expect(r.status).toBe('ok')
})

// a1 (≤16 batching) — 17 children → batches of 16 + 1
test('a1: dispatch fans out in <=16 batches', async () => {
  const batches: number[] = []
  const node: AnyNode = {
    slug: 'e',
    status: 'building',
    phases: Array.from({ length: 17 }, (_, i) => ({ slug: `p${i}`, status: 'pending' })),
  }
  const seam: WorkflowSeam = {
    dispatch: async (units) => {
      batches.push(units.length)
    },
    collect: async (p) => allDone(p),
  }
  await workflowLoop(node, 'phase', { retry_limit: 1 }, seam)
  expect(batches).toEqual([16, 1])
})

// a2 — evidence-driven skip: only OPEN children are dispatched
test('a2: resume-safe skip dispatches only the open child (done ones skipped)', async () => {
  const dispatched: string[] = []
  const node: AnyNode = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'A', status: 'done', acceptance_criteria: [{ status: 'done', evidence: ['e'] }] },
      { slug: 'B', status: 'pending' },
    ],
  }
  const seam: WorkflowSeam = {
    dispatch: async (units) => {
      for (const u of units) dispatched.push(u.child.slug)
    },
    collect: async (p) => allDone(p),
  }
  await workflowLoop(node, 'phase', { retry_limit: 1 }, seam)
  expect(dispatched).toEqual(['B'])
})

// a3 — worker selection follows the executor field per unit
test('a3: worker selection follows each unit executor field', async () => {
  const seen: Record<string, string> = {}
  const node: AnyNode = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'A', status: 'pending', executor: 'workflow' },
      { slug: 'B', status: 'pending', executor: 'implement' },
      { slug: 'C', status: 'pending' },
    ],
  }
  const seam: WorkflowSeam = {
    dispatch: async (units) => {
      for (const u of units) seen[u.child.slug] = u.worker
    },
    collect: async (p) => allDone(p),
  }
  await workflowLoop(node, 'phase', { retry_limit: 1 }, seam)
  expect(seen).toEqual({ A: 'workflow', B: 'implement', C: 'implement' })
})

// a4 — merged result partitioned from the collected task-file state
test('a4: collect yields a merged result partitioned by evidence (task-file state)', async () => {
  let captured: MergedResult | undefined
  const node: AnyNode = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'A', status: 'pending' },
      { slug: 'B', status: 'pending' },
    ],
  }
  const seam: WorkflowSeam = {
    dispatch: async () => {},
    collect: async (p) => ({
      ...p,
      phases: [
        { slug: 'A', status: 'done', acceptance_criteria: [{ status: 'done', evidence: ['x'] }] },
        { slug: 'B', status: 'in-progress', failures: ['boom'] },
      ],
    }),
    gates: async (_p, merged) => {
      captured = merged
      return { ok: true }
    },
  }
  await workflowLoop(node, 'phase', { retry_limit: 1 }, seam)
  expect(captured?.done.map((c) => c.slug)).toEqual(['A'])
  expect(captured?.failed.map((c) => c.slug)).toEqual(['B'])
})

// a5 — SEQUENTIAL default unaffected: mode!=workflow never touches the seam
test('a5: sequential default never dispatches to the workflow seam', async () => {
  let dispatched = false
  let bodyRan = false
  const node: AnyNode = { slug: 't', status: 'build', phases: [{ slug: 'A', status: 'pending' }] }
  const seam: WorkflowSeam = {
    dispatch: async () => {
      dispatched = true
    },
    collect: async (p) => p,
  }
  const deps = makeDeps({
    workflow: seam,
    runChildTier: async (_t, n) => {
      bodyRan = true
      return { node: n, status: 'ok' as const }
    },
  })
  await loopStep({ name: 'loop', each: 'phase' }, node, ctx, { build: {} }, deps)
  expect(dispatched).toBe(false)
  expect(bodyRan).toBe(true)
})

// ── workflow-gates-stop-retry a1 — gates run ONCE over the merged result ──
test('p3a1: wrap-gates run ONCE over the merged result (not per unit)', async () => {
  let gateCalls = 0
  const node: AnyNode = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'A', status: 'pending' },
      { slug: 'B', status: 'pending' },
      { slug: 'C', status: 'pending' },
    ],
  }
  const seam: WorkflowSeam = {
    dispatch: async () => {},
    collect: async (p) => allDone(p),
    gates: async () => {
      gateCalls++
      return { ok: true }
    },
  }
  const r = await workflowLoop(node, 'phase', { retry_limit: 3 }, seam)
  expect(gateCalls).toBe(1)
  expect(r.status).toBe('ok')
})

// p3a2 — a unit flagging a stop-condition halts after the collect (no re-dispatch)
test('p3a2: a stop-condition flagged by a unit halts the loop after collect', async () => {
  let dispatches = 0
  const node: AnyNode = { slug: 't', status: 'build', phases: [{ slug: 'A', status: 'pending' }] }
  const seam: WorkflowSeam = {
    dispatch: async () => {
      dispatches++
    },
    collect: async (p) => ({
      ...p,
      phases: [
        { slug: 'A', status: 'in-progress', failures: ['a decision deviates from the plan'] },
      ],
    }),
    gates: async () => ({ ok: true }),
  }
  const r = await workflowLoop(
    node,
    'phase',
    { retry_limit: 3, stop: ['a decision deviates from the plan'] },
    seam,
  )
  expect(r.status).toBe('failed')
  expect(r.error).toMatch(/stop condition/)
  expect(dispatches).toBe(1)
})

// p3a3 — retry is evidence-driven: failing child retried to retry_limit, green skipped
test('p3a3: a flaky child retries while green children are skipped', async () => {
  let attempt = 0
  const dispatchCount: Record<string, number> = {}
  const node: AnyNode = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'X', status: 'pending' },
      { slug: 'Y', status: 'pending' },
    ],
  }
  const seam: WorkflowSeam = {
    dispatch: async (units) => {
      for (const u of units) dispatchCount[u.child.slug] = (dispatchCount[u.child.slug] ?? 0) + 1
    },
    collect: async (p) => {
      attempt++
      const xDone = attempt >= 3
      return {
        ...p,
        phases: [
          xDone
            ? {
                slug: 'X',
                status: 'done',
                acceptance_criteria: [{ status: 'done', evidence: ['e'] }],
              }
            : { slug: 'X', status: 'in-progress', failures: ['retry'] },
          { slug: 'Y', status: 'done', acceptance_criteria: [{ status: 'done', evidence: ['e'] }] },
        ],
      }
    },
    gates: async () => ({ ok: true }),
  }
  const r = await workflowLoop(node, 'phase', { retry_limit: 3 }, seam)
  expect(r.status).toBe('ok')
  expect(dispatchCount['X']).toBe(3)
  expect(dispatchCount['Y']).toBe(1)
})

// p3a3 — a permanently-failing child is dispatched exactly retry_limit times then halts
test('p3a3: a permanently-failing child halts after exactly retry_limit attempts', async () => {
  const dispatchCount: Record<string, number> = {}
  const node: AnyNode = { slug: 't', status: 'build', phases: [{ slug: 'X', status: 'pending' }] }
  const seam: WorkflowSeam = {
    dispatch: async (units) => {
      for (const u of units) dispatchCount[u.child.slug] = (dispatchCount[u.child.slug] ?? 0) + 1
    },
    collect: async (p) => ({
      ...p,
      phases: [{ slug: 'X', status: 'in-progress', failures: ['nope'] }],
    }),
    gates: async () => ({ ok: true }),
  }
  const r = await workflowLoop(node, 'phase', { retry_limit: 3 }, seam)
  expect(r.status).toBe('failed')
  expect(dispatchCount['X']).toBe(3)
})

// p3a4 — a gate-failure writes failures to the affected child; no ac flips to done
test('p3a4: a gate-failure lands failures on the child without flipping an ac to done', async () => {
  let collectCount = 0
  const node: AnyNode = { slug: 't', status: 'build', phases: [{ slug: 'A', status: 'pending' }] }
  const seam: WorkflowSeam = {
    dispatch: async () => {},
    collect: async (p) => {
      collectCount++
      if (collectCount === 1) {
        return {
          ...p,
          phases: [
            {
              slug: 'A',
              status: 'in-progress',
              acceptance_criteria: [{ id: 'a1', status: 'pending' }],
            },
          ],
        }
      }
      // after the failed gate, the gate worker self-wrote failures (CLI); ac stays pending
      return {
        ...p,
        phases: [
          {
            slug: 'A',
            status: 'blocked',
            failures: ['code-validate: rule X violated'],
            acceptance_criteria: [{ id: 'a1', status: 'pending' }],
          },
        ],
      }
    },
    gates: async () => ({ ok: false }),
  }
  const r = await workflowLoop(node, 'phase', { retry_limit: 1 }, seam)
  const a = (r.node.phases as AnyNode[]).find((p) => p.slug === 'A')!
  expect(a.failures).toEqual(['code-validate: rule X violated'])
  expect((a.acceptance_criteria as { status: string }[])[0]?.status).not.toBe('done')
})
