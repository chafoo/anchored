import { test, expect } from 'bun:test'
import { createEngine } from './engine.js'
import { nextChild as realNextChild } from '../ops/scope/children/children.js'
import type { AnyNode, OpsLike } from './step-runner.js'

function makeOps(): OpsLike {
  return {
    setStatus: async (n) => n,
    nextChild: (n) => {
      const children = (n.phases ?? n.tasks ?? []) as { slug: string; status: string }[]
      return realNextChild(children)
    },
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

const config = {
  epic: { build: { each: 'task' } },
  task: { build: { each: 'phase' } },
  phase: { build: { steps: [{ name: 'implement', use: 'impl' }] } },
}

// a4 — two-level recursion epic→task→phase through the SAME engine code
test('engine recurses epic.build.each:task → task.build.each:phase → phase implement', async () => {
  const spawnCalls: string[] = []
  const engine = createEngine({
    config,
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    spawn: {
      run: async (i) => {
        spawnCalls.push(`${i.tier}/${i.slug}`)
        return { ok: true, kind: 'impl', evidence: ['ev'] }
      },
    },
    ops: makeOps(),
    descriptorFor: () => ({ childTier: undefined }),
  })
  const epicNode: AnyNode = {
    slug: 'e',
    status: 'build',
    tasks: [
      {
        slug: 't1',
        status: 'pending',
        phases: [
          { slug: 'pA', status: 'pending' },
          { slug: 'pB', status: 'pending' },
        ],
      },
    ],
  }
  const r = await engine.run('epic', epicNode)
  expect(r.status).toBe('ok')
  // one implement spawn per leaf phase, each at the phase tier
  expect(spawnCalls).toEqual(['phase/pA', 'phase/pB'])
})

// a5 — both loop modes on the epic→task edge cover the same child set
test('sequential and workflow modes cover the same child set', async () => {
  const epicNode: AnyNode = {
    slug: 'e',
    status: 'build',
    tasks: [
      { slug: 't1', status: 'pending', phases: [] },
      { slug: 't2', status: 'pending', phases: [] },
    ],
  }
  // sequential: runChildTier per task
  const seqTasks: string[] = []
  const seqEngine = createEngine({
    config: { epic: { build: { each: 'task' } }, task: { build: {} } },
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    spawn: { run: async () => ({ ok: true, kind: 'x' }) },
    ops: {
      ...makeOps(),
      setStatus: async (n) => n,
    },
    descriptorFor: () => ({ childTier: undefined }),
  })
  // capture via a workflow seam for the workflow run; collect marks dispatched
  // children done (simulated self-write) so the evidence-driven loop converges
  const wfTasks: string[] = []
  const wfEngine = createEngine({
    config: { epic: { build: { each: 'task', mode: 'workflow' } }, task: { build: {} } },
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    spawn: { run: async () => ({ ok: true, kind: 'x' }) },
    ops: makeOps(),
    descriptorFor: () => ({ childTier: undefined }),
    workflow: {
      dispatch: async (units) => {
        for (const u of units) wfTasks.push(u.child.slug)
      },
      collect: async (parent) => ({
        ...parent,
        tasks: ((parent.tasks as { slug: string }[]) ?? []).map((t) => ({ ...t, status: 'done' })),
      }),
    },
  })
  // sequential walks tasks via next-child; record by reading final statuses
  const seqResult = await seqEngine.run('epic', epicNode)
  for (const t of (seqResult.node.tasks as { slug: string; status: string }[]) ?? []) {
    if (t.status === 'done') seqTasks.push(t.slug)
  }
  await wfEngine.run('epic', epicNode)
  expect(seqTasks.sort()).toEqual(['t1', 't2'])
  expect(wfTasks.sort()).toEqual(['t1', 't2'])
})
