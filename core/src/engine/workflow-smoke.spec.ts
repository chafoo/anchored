import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createEngine } from './engine.js'
import { createNodeOps, type NodeOpsDeps } from '../ops/node-ops.js'
import { taskDescriptor } from '../schema/tiers/task.js'
import { nextChild as realNextChild } from '../ops/scope/children.js'
import type { AnyNode, OpsLike, WorkflowSeam } from './step-runner.js'

// in-memory nodeOps (JSON substrate) — enough to exercise setExecutor + setStatus
function memOps() {
  const store = new Map<string, string>()
  const deps: NodeOpsDeps = {
    io: {
      atomicWrite: async (p, c) => {
        store.set(p, c)
      },
      readFile: async (p) => {
        const d = store.get(p)
        if (d === undefined) throw new Error(`ENOENT ${p}`)
        return d
      },
    },
    render: (n) => JSON.stringify(n),
    parse: (r) => JSON.parse(r),
    pathFor: (slug) => `t/${slug}.yml`,
  }
  return createNodeOps(taskDescriptor, deps)
}

// engine OpsLike that advances child status in-place (sequential path)
function engineOps(): OpsLike {
  return {
    setStatus: async (n) => n,
    nextChild: (n) =>
      realNextChild((n.phases ?? n.tasks ?? []) as { slug: string; status: string }[]),
    setChildStatus: async (n, slug, status) => {
      const children = ((n.phases as { slug: string }[]) ?? []).map((c) =>
        c.slug === slug ? { ...c, status } : c,
      )
      return { ...n, phases: children }
    },
    addQuestion: async (n) => n,
    resolveQuestion: async (n) => n,
    appendLog: async (n) => n,
  }
}

const taskConfig = {
  task: { build: { each: 'phase', mode: 'workflow', retry_limit: 3 } },
  phase: { build: { steps: [{ name: 'implement', use: 'impl' }] } },
}

function freshTask(): AnyNode {
  return {
    schema_version: 2,
    slug: 'wf-smoke',
    title: 'WF smoke',
    status: 'build',
    phases: [
      {
        name: 'P1',
        slug: 'p1',
        status: 'pending',
        acceptance_criteria: [{ id: 'a1', status: 'pending' }],
      },
      {
        name: 'P2',
        slug: 'p2',
        status: 'pending',
        acceptance_criteria: [{ id: 'a1', status: 'pending' }],
      },
    ],
  }
}

// the seam's collect simulates the units' CLI self-write: every phase AC reaches
// done WITH evidence (the evidence-driven completion the loop relies on)
function selfWriteCollect(): WorkflowSeam['collect'] {
  return async (parent) => ({
    ...parent,
    phases: ((parent.phases as AnyNode[]) ?? []).map((p) => ({
      ...p,
      status: 'done',
      acceptance_criteria: ((p.acceptance_criteria as AnyNode[]) ?? []).map((ac) => ({
        ...ac,
        status: 'done',
        evidence: [`${p.slug}.ts:1 — implemented`],
      })),
    })),
  })
}

// workflow-smoke-e2e a1 + a3 — a ≥2-phase task with executor=workflow runs green
// end-to-end via the fan-out path; executor set through the set-executor OP
test('a1/a3: a 2-phase executor=workflow task runs green end-to-end; build→wrap', async () => {
  const ops = memOps()
  // persist + set executor via the OP (not raw) on both phases
  await ops.create(freshTask())
  await ops.setExecutor(await ops.read('wf-smoke'), 'p1', 'workflow')
  const node = await ops.setExecutor(await ops.read('wf-smoke'), 'p2', 'workflow')
  expect((node.phases as { executor?: string }[]).every((p) => p.executor === 'workflow')).toBe(
    true,
  )

  const dispatched: string[] = []
  const engine = createEngine({
    config: taskConfig,
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    spawn: { run: async () => ({ ok: true, kind: 'impl', evidence: ['ev'] }) },
    ops: engineOps(),
    descriptorFor: (t) => ({ childTier: t === 'task' ? 'phase' : undefined }),
    workflow: {
      dispatch: async (units) => {
        for (const u of units) dispatched.push(`${u.worker}:${u.child.slug}`) // WORKFLOW path taken
      },
      collect: selfWriteCollect(),
    },
  })

  const r = await engine.run('task', node)
  expect(r.status).toBe('ok')
  // a3 — the WORKFLOW dispatch branch ran with the workflow worker per phase
  expect(dispatched.sort()).toEqual(['workflow:p1', 'workflow:p2'])

  // a1 — every phase AC is done WITH evidence
  const phases = r.node.phases as {
    acceptance_criteria: { status: string; evidence?: string[] }[]
  }[]
  for (const p of phases) {
    for (const ac of p.acceptance_criteria) {
      expect(ac.status).toBe('done')
      expect(ac.evidence?.length).toBeGreaterThan(0)
    }
  }

  // a1 — the task is then legally transitioned build→wrap through the substrate
  const wrapped = await ops.setStatus({ ...(r.node as AnyNode), status: 'build' }, 'wrap')
  expect(wrapped.status).toBe('wrap')
})

// workflow-smoke-e2e a2 — equivalence: SEQUENTIAL vs WORKFLOW over the same
// definition → same done-phase set + same end status, different execution path
test('a2: sequential and workflow paths yield the same done set + end status', async () => {
  const doneSet = (n: AnyNode): string[] =>
    ((n.phases as { slug: string; status: string }[]) ?? [])
      .filter((p) => p.status === 'done')
      .map((p) => p.slug)
      .sort()

  // SEQUENTIAL: runChildTier marks each phase, loop advances child status to done
  const seqEngine = createEngine({
    config: { task: { build: { each: 'phase' } }, phase: { build: {} } },
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    spawn: { run: async () => ({ ok: true, kind: 'impl', evidence: ['ev'] }) },
    ops: engineOps(),
    descriptorFor: (t) => ({ childTier: t === 'task' ? 'phase' : undefined }),
  })
  const seq = await seqEngine.run('task', freshTask())

  // WORKFLOW: same definition, fan-out path, collect self-writes done
  const wfEngine = createEngine({
    config: taskConfig,
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    spawn: { run: async () => ({ ok: true, kind: 'impl', evidence: ['ev'] }) },
    ops: engineOps(),
    descriptorFor: (t) => ({ childTier: t === 'task' ? 'phase' : undefined }),
    workflow: { dispatch: async () => {}, collect: selfWriteCollect() },
  })
  const wf = await wfEngine.run('task', freshTask())

  expect(seq.status).toBe('ok')
  expect(wf.status).toBe('ok')
  expect(doneSet(seq.node)).toEqual(['p1', 'p2'])
  expect(doneSet(wf.node)).toEqual(doneSet(seq.node))
})

// workflow-smoke-e2e a4 — the Bash(anchored *) allowlist precondition is documented
// in the build skill (else the background workflow hangs on a permission prompt)
test('a4: build skill documents the Bash(anchored *) allowlist precondition', () => {
  const skill = readFileSync(
    new URL('../../../plugin/skills/build/SKILL.md', import.meta.url),
    'utf8',
  )
  expect(skill).toContain('Bash(anchored *)')
  expect(skill.toLowerCase()).toContain('allowlist')
})
