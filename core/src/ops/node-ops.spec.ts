import { test, expect } from 'bun:test'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { createNodeOps, type NodeOpsDeps } from './node-ops.js'
import { phaseDescriptor } from '../schema/tiers/phase.js'
import { taskDescriptor, TaskNodeSchema } from '../schema/tiers/task.js'
import { createParser } from '../parser/parse.js'
import { createRenderer, defaultSchemaUrl } from '../parser/render.js'

function makeDeps() {
  const writes: { path: string; content: string }[] = []
  const store = new Map<string, string>()
  const deps: NodeOpsDeps = {
    io: {
      async atomicWrite(path: string, content: string) {
        writes.push({ path, content })
        store.set(path, content)
      },
      async readFile(path: string) {
        const d = store.get(path)
        if (d === undefined) throw new Error(`ENOENT: ${path}`)
        return d
      },
    },
    render: (node) => JSON.stringify(node),
    parse: (raw) => JSON.parse(raw),
    pathFor: (slug) => `t/${slug}.yml`,
  }
  return { deps, writes, store }
}

// a1 — factory with fake deps + a read
test('createNodeOps is a factory over fake deps; read round-trips', async () => {
  const { deps } = makeDeps()
  const ops = createNodeOps(phaseDescriptor, deps)
  await ops.create({ slug: 'p', status: 'pending' })
  const node = await ops.read('p')
  expect(node.slug).toBe('p')
})

// a2 — setAcStatus('done') without evidence throws and does NOT write
test('setAcStatus done without evidence throws and never writes', async () => {
  const { deps, writes } = makeDeps()
  const ops = createNodeOps(phaseDescriptor, deps)
  const node = {
    slug: 'p',
    status: 'in-progress',
    acceptance_criteria: [{ id: 'a1', status: 'pending' }],
  }
  await expect(ops.setAcStatus(node, 'a1', 'done')).rejects.toThrow()
  expect(writes.length).toBe(0)
})

// a3 — addEvidence appends evidence and flips the AC to done atomically (one write)
test('addEvidence flips ac to done atomically (single write)', async () => {
  const { deps, writes } = makeDeps()
  const ops = createNodeOps(phaseDescriptor, deps)
  const node = {
    slug: 'p',
    status: 'in-progress',
    acceptance_criteria: [{ id: 'a1', status: 'pending' }],
  }
  const next = await ops.addEvidence(node, 'a1', ['src/x.ts:1 — proof'])
  expect(next.acceptance_criteria?.[0]?.status).toBe('done')
  expect(next.acceptance_criteria?.[0]?.evidence).toEqual(['src/x.ts:1 — proof'])
  expect(writes.length).toBe(1)
})

// workflow-mode set-executor-op a1 — setExecutor sets the target phase's executor
// + atomic-writes; a non-enum value throws and NEVER writes
test('setExecutor writes a valid executor; a bogus value throws and never writes', async () => {
  const { deps, writes } = makeDeps()
  const ops = createNodeOps(taskDescriptor, deps)
  const node = { slug: 't', status: 'build', phases: [{ slug: 'p1', status: 'pending' }] }
  const ok = await ops.setExecutor(node, 'p1', 'workflow')
  expect((ok.phases as { executor?: string }[])[0]?.executor).toBe('workflow')
  expect(writes.length).toBe(1)
  await expect(ops.setExecutor(node, 'p1', 'bogus')).rejects.toThrow()
  expect(writes.length).toBe(1) // the bogus value did NOT write
})

// workflow-mode set-executor-op a2 — a phase without executor round-trips
// byte-identical (no default 'implement' injected)
test('a phase without executor round-trips byte-identical (no default injected)', () => {
  const parser = createParser({ yaml: { parse: yamlParse }, schemas: { task: TaskNodeSchema } })
  const renderer = createRenderer({
    yaml: { stringify: yamlStringify },
    schemaUrl: defaultSchemaUrl,
  })
  const raw =
    'schema_version: 2\nslug: t\ntitle: T\nstatus: build\nphases:\n  - name: P1\n    slug: p1\n    status: pending\n'
  const once = parser.parseNodeYAML(raw, { profile: 'task-file', tier: 'task' })
  const twice = parser.parseNodeYAML(renderer.renderNodeYAML(once, { tier: 'task' }), {
    profile: 'task-file',
    tier: 'task',
  })
  expect(twice).toEqual(once)
  const ph = (once as { phases: Record<string, unknown>[] }).phases[0]!
  expect('executor' in ph).toBe(false) // setExecutor only writes when explicitly called
})

// workflow-mode set-executor-op a3 — set-field on a reserved field (executor) is
// rejected and never writes; a non-reserved field still writes
test('set-field on reserved executor is rejected and never writes', async () => {
  const { deps, writes } = makeDeps()
  const ops = createNodeOps(taskDescriptor, deps)
  const node = { slug: 't', status: 'build', phases: [{ slug: 'p1', status: 'pending' }] }
  await expect(ops.setField(node, 'executor', 'workflow')).rejects.toThrow(/reserved/i)
  expect(writes.length).toBe(0)
  await ops.setField(node, 'title', 'New')
  expect(writes.length).toBe(1)
})

// q6 verbs — addPhase / addAc build the task structure plan-decompose produces
test('addPhase + addAc grow the phases/ACs structure (dedup-guarded)', async () => {
  const { deps } = makeDeps()
  const ops = createNodeOps(taskDescriptor, deps)
  type T = { phases?: { slug: string; acceptance_criteria?: { id: string }[] }[] }
  let node = (await ops.addPhase(
    { slug: 't', status: 'build' },
    { slug: 'p1', status: 'pending', name: 'P1' },
  )) as unknown as T
  expect(node.phases?.[0]?.slug).toBe('p1')
  node = (await ops.addAc(node as never, 'p1', {
    id: 'a1',
    text: 'prove it',
    status: 'pending',
  })) as unknown as T
  expect(node.phases?.[0]?.acceptance_criteria?.[0]?.id).toBe('a1')
  await expect(ops.addPhase(node as never, { slug: 'p1', status: 'pending' })).rejects.toThrow(
    /already exists/,
  )
})

// q6 verb — addChildEvidence flips a CHILD phase's AC to done WITH evidence
test('addChildEvidence flips a child-phase AC to done with evidence', async () => {
  const { deps } = makeDeps()
  const ops = createNodeOps(taskDescriptor, deps)
  const node = {
    slug: 't',
    status: 'build',
    phases: [
      { slug: 'p1', status: 'pending', acceptance_criteria: [{ id: 'a1', status: 'pending' }] },
    ],
  }
  const next = (await ops.addChildEvidence(node, 'p1', 'a1', ['p1.ts:1 — proof'])) as unknown as {
    phases: { acceptance_criteria: { status: string; evidence: string[] }[] }[]
  }
  expect(next.phases[0]?.acceptance_criteria[0]?.status).toBe('done')
  expect(next.phases[0]?.acceptance_criteria[0]?.evidence).toEqual(['p1.ts:1 — proof'])
  await expect(ops.addChildEvidence(node, 'p1', 'nope', ['x'])).rejects.toThrow(/no acceptance/)
})

// agents-reconcile — set-field dotted path sets nested context.wrap without
// clobbering siblings; reserved check is on the top segment
test('setField dotted path writes nested context.wrap, preserves siblings', async () => {
  const { deps } = makeDeps()
  const ops = createNodeOps(taskDescriptor, deps)
  const node = { slug: 't', status: 'wrap', context: { plan: 'P', build: 'B' } }
  const next = (await ops.setField(node, 'context.wrap', 'the TL;DR')) as unknown as {
    context: { plan: string; build: string; wrap: string }
  }
  expect(next.context.wrap).toBe('the TL;DR')
  expect(next.context.plan).toBe('P') // sibling preserved
  expect(next.context.build).toBe('B')
  // a dotted path can't shadow a reserved top segment
  await expect(ops.setField(node, 'executor.x', 'y')).rejects.toThrow(/reserved/i)
})

// redo-loop-verbs F9 — setChildFailures rejects a child-phase AC (failures + pending,
// evidence kept); setChildAcStatus flips it; done needs evidence
test('setChildFailures rejects a child AC (pending + failures, evidence kept)', async () => {
  const { deps } = makeDeps()
  const ops = createNodeOps(taskDescriptor, deps)
  const node = {
    slug: 't',
    status: 'build',
    phases: [
      {
        slug: 'p1',
        status: 'in-progress',
        acceptance_criteria: [{ id: 'a1', status: 'done', evidence: ['x.ts:1 — proof'] }],
      },
    ],
  }
  const next = (await ops.setChildFailures(node, 'p1', 'a1', [
    'gate: nicht erfüllt',
  ])) as unknown as {
    phases: { acceptance_criteria: { status: string; failures: string[]; evidence: string[] }[] }[]
  }
  const ac = next.phases[0]!.acceptance_criteria[0]!
  expect(ac.status).toBe('pending') // flipped back for the re-do
  expect(ac.failures).toEqual(['gate: nicht erfüllt'])
  expect(ac.evidence).toEqual(['x.ts:1 — proof']) // prior evidence kept as history
  // setChildAcStatus → done still requires evidence (invariant holds one tier down)
  await expect(
    ops.setChildAcStatus(
      {
        slug: 't',
        status: 'build',
        phases: [
          {
            slug: 'p1',
            status: 'in-progress',
            acceptance_criteria: [{ id: 'a1', status: 'pending' }],
          },
        ],
      },
      'p1',
      'a1',
      'done',
    ),
  ).rejects.toThrow(/evidence/i)
})

// a4 — setStatus runs assertTransition (forward-only)
test('setStatus enforces forward-only transitions', async () => {
  const { deps, writes } = makeDeps()
  const ops = createNodeOps(phaseDescriptor, deps)
  await ops.setStatus({ slug: 'p', status: 'pending' }, 'in-progress') // legal
  expect(writes.length).toBe(1)
  await expect(ops.setStatus({ slug: 'p', status: 'pending' }, 'done')).rejects.toThrow() // skip
})
