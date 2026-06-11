import { test, expect } from 'bun:test'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { createNodeOps, type NodeOpsDeps } from './node-ops.js'
import { phaseDescriptor } from '../schema/tiers/phase.js'
import { taskDescriptor, TaskNodeSchema } from '../schema/tiers/task.js'
import { epicDescriptor } from '../schema/tiers/epic.js'
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

// Fixtures are COMPLETE, schema-valid nodes — persist() now validates the full
// tier schema before every write (G1). A real node always carries these fields
// (read parses them; create seeds them), so the fixtures mirror reality.
const phaseN = (over: Record<string, unknown> = {}) => ({
  name: 'P',
  slug: 'p',
  status: 'pending',
  ...over,
})
const taskN = (over: Record<string, unknown> = {}) => ({
  schema_version: 2,
  slug: 't',
  title: 'T',
  status: 'build',
  ...over,
})

// a1 — factory with fake deps + a read
test('createNodeOps is a factory over fake deps; read round-trips', async () => {
  const { deps } = makeDeps()
  const ops = createNodeOps(phaseDescriptor, deps)
  await ops.create(phaseN())
  const node = await ops.read('p')
  expect(node.slug).toBe('p')
})

// a2 — setAcStatus('done') without evidence throws and does NOT write
test('setAcStatus done without evidence throws and never writes', async () => {
  const { deps, writes } = makeDeps()
  const ops = createNodeOps(phaseDescriptor, deps)
  const node = phaseN({
    status: 'in-progress',
    acceptance_criteria: [{ id: 'a1', text: 'prove it', status: 'pending' }],
  })
  await expect(ops.setAcStatus(node, 'a1', 'done')).rejects.toThrow()
  expect(writes.length).toBe(0)
})

// a3 — addEvidence appends evidence and flips the AC to done atomically (one write)
test('addEvidence flips ac to done atomically (single write)', async () => {
  const { deps, writes } = makeDeps()
  const ops = createNodeOps(phaseDescriptor, deps)
  const node = phaseN({
    status: 'in-progress',
    acceptance_criteria: [{ id: 'a1', text: 'prove it', status: 'pending' }],
  })
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
  const node = taskN({ phases: [{ name: 'P1', slug: 'p1', status: 'pending' }] })
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
  const node = taskN({ phases: [{ name: 'P1', slug: 'p1', status: 'pending' }] })
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
  let node = (await ops.addPhase(taskN(), {
    slug: 'p1',
    status: 'pending',
    name: 'P1',
  })) as unknown as T
  expect(node.phases?.[0]?.slug).toBe('p1')
  node = (await ops.addAc(node as never, 'p1', {
    id: 'a1',
    text: 'prove it',
    status: 'pending',
  })) as unknown as T
  expect(node.phases?.[0]?.acceptance_criteria?.[0]?.id).toBe('a1')
  await expect(
    ops.addPhase(node as never, { slug: 'p1', status: 'pending', name: 'P1' }),
  ).rejects.toThrow(/already exists/)
})

// q6 verb — addChildEvidence flips a CHILD phase's AC to done WITH evidence
test('addChildEvidence flips a child-phase AC to done with evidence', async () => {
  const { deps } = makeDeps()
  const ops = createNodeOps(taskDescriptor, deps)
  const node = taskN({
    phases: [
      {
        name: 'P1',
        slug: 'p1',
        status: 'pending',
        acceptance_criteria: [{ id: 'a1', text: 'prove it', status: 'pending' }],
      },
    ],
  })
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
  const node = taskN({ status: 'wrap', context: { plan: 'P', build: 'B' } })
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
  const node = taskN({
    phases: [
      {
        name: 'P1',
        slug: 'p1',
        status: 'in-progress',
        acceptance_criteria: [
          { id: 'a1', text: 'prove it', status: 'done', evidence: ['x.ts:1 — proof'] },
        ],
      },
    ],
  })
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
      taskN({
        phases: [
          {
            name: 'P1',
            slug: 'p1',
            status: 'in-progress',
            acceptance_criteria: [{ id: 'a1', text: 'prove it', status: 'pending' }],
          },
        ],
      }),
      'p1',
      'a1',
      'done',
    ),
  ).rejects.toThrow(/evidence/i)
})

// phase-rules F1 — setPhaseRules attaches a {path, why} to a child phase (dedup by path)
test('setPhaseRules attaches a rule to a phase (dedup by path)', async () => {
  const { deps } = makeDeps()
  const ops = createNodeOps(taskDescriptor, deps)
  const node = taskN({ phases: [{ name: 'P1', slug: 'p1', status: 'pending' }] })
  const r1 = (await ops.setPhaseRules(node, 'p1', {
    path: '.claude/rules/dom.md',
    why: 'no innerHTML',
  })) as unknown as {
    phases: { rules: { path: string; why: string }[] }[]
  }
  expect(r1.phases[0]!.rules).toEqual([{ path: '.claude/rules/dom.md', why: 'no innerHTML' }])
  // same path → replace (dedup), not duplicate
  const r2 = (await ops.setPhaseRules(r1 as never, 'p1', {
    path: '.claude/rules/dom.md',
    why: 'updated',
  })) as unknown as {
    phases: { rules: { path: string; why: string }[] }[]
  }
  expect(r2.phases[0]!.rules).toEqual([{ path: '.claude/rules/dom.md', why: 'updated' }])
})

// a4 — setStatus runs assertTransition (forward-only)
test('setStatus enforces forward-only transitions', async () => {
  const { deps, writes } = makeDeps()
  const ops = createNodeOps(phaseDescriptor, deps)
  await ops.setStatus(phaseN(), 'in-progress') // legal
  expect(writes.length).toBe(1)
  await expect(ops.setStatus(phaseN(), 'done')).rejects.toThrow() // skip
})

// ── G1: persist() validates the full tier schema BEFORE write (fail-closed) ──
const validEpic = (over: Record<string, unknown> = {}) => ({
  schema_version: 2,
  slug: 'e',
  title: 'E',
  status: 'planning',
  tasks: [{ slug: 't1', status: 'pending' }],
  ...over,
})

// G1-a1 — an invalid mutation is rejected AT the writing op; io.atomicWrite never runs.
// This is the EXACT dogfood corruption: an epic child set to a phase word that is
// NOT in the TaskStub enum (pending|active|done|blocked). Before G1 the write
// returned ok and bricked the node on the next read.
test('G1: an invalid mutation is rejected at the op and never writes', async () => {
  const { deps, writes } = makeDeps()
  const ops = createNodeOps(epicDescriptor, deps)
  await ops.create(validEpic())
  expect(writes.length).toBe(1) // the valid create wrote
  await expect(ops.setChildStatus(validEpic(), 't1', 'in-progress')).rejects.toThrow()
  expect(writes.length).toBe(1) // the invalid mutation did NOT write
})

// G1-a2 — the rejection is a typed InvalidNode error, located (tier + slug + field path),
// so the CLI emits the same JSON error envelope as any other op (q4).
test('G1: rejection is a typed, located InvalidNode error', async () => {
  const { deps } = makeDeps()
  const ops = createNodeOps(epicDescriptor, deps)
  let err: { kind?: string; message?: string } | undefined
  try {
    await ops.setChildStatus(validEpic({ slug: 'my-epic' }), 't1', 'in-progress')
  } catch (e) {
    err = e as { kind?: string; message?: string }
  }
  expect(err?.kind).toBe('InvalidNode')
  expect(err?.message).toContain('my-epic') // slug located
  expect(err?.message).toContain('tasks') // offending field path located
})

// G1-a3 — regression: after a rejected write the file is untouched, so read()
// still returns the prior VALID node (no brick).
test('G1 regression: a rejected write leaves the prior valid node re-readable', async () => {
  const { deps } = makeDeps()
  const ops = createNodeOps(epicDescriptor, deps)
  await ops.create(validEpic())
  await expect(ops.setChildStatus(validEpic(), 't1', 'in-progress')).rejects.toThrow()
  const read = await ops.read('e')
  expect((read.tasks as { status: string }[])[0]?.status).toBe('pending') // untouched
})
