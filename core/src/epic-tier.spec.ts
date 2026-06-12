import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { createParser } from './parser/parse.js'
import { createRenderer, defaultSchemaUrl } from './parser/render.js'
import { createIo, type IoDeps } from './io.js'
import { createEngine } from './engine/engine.js'
import { createResolveSteps } from './engine/scope/resolve-steps.js'
import { EpicNodeSchema } from './schema/tiers/epic.js'
import { TaskNodeSchema } from './schema/tiers/task.js'
import { nextChild as realNextChild } from './ops/scope/children.js'
import type { AnyNode, OpsLike } from './engine/step-runner.js'

// nested-slugs a1 — a nested slug task-file round-trips losslessly
test('nested slug task-file round-trips losslessly', () => {
  const parser = createParser({ yaml: { parse }, schemas: { task: TaskNodeSchema } })
  const renderer = createRenderer({ yaml: { stringify }, schemaUrl: defaultSchemaUrl })
  const raw = 'schema_version: 2\nslug: anchored-v2-core/epic-tier\ntitle: T\nstatus: build\n'
  const once = parser.parseNodeYAML(raw, { profile: 'task-file', tier: 'task' })
  const twice = parser.parseNodeYAML(renderer.renderNodeYAML(once, { tier: 'task' }), {
    profile: 'task-file',
    tier: 'task',
  })
  expect(twice).toEqual(once)
  expect((once as { slug: string }).slug).toBe('anchored-v2-core/epic-tier')
})

// nested-slugs a2 — io resolves a nested slug to .claude/tasks/<epic>/<slug>.yml + mkdir
test('io writes a nested slug to .claude/tasks/<epic>/<slug>.yml', async () => {
  const calls: string[] = []
  const files = new Map<string, string>()
  const deps: IoDeps = {
    fs: {
      async mkdir(d: string) {
        calls.push('mkdir:' + d)
        return undefined
      },
      async writeFile(p: string, d: string) {
        files.set(p, d)
      },
      async rename(f: string, t: string) {
        const d = files.get(f)
        files.delete(f)
        if (d !== undefined) files.set(t, d)
      },
      async readFile(p: string) {
        const d = files.get(p)
        if (d === undefined) throw new Error('ENOENT')
        return d
      },
      async unlink(p: string) {
        files.delete(p)
      },
    },
    lock: { acquire: async () => async () => {} },
    rand: () => 'r',
    pid: () => 1,
  }
  const io = createIo(deps)
  const path = '.claude/tasks/my-epic/01-task.yml'
  await io.atomicWrite(path, 'content')
  expect(calls).toContain('mkdir:.claude/tasks/my-epic')
  expect(await io.readFile(path)).toBe('content')
})

// epic-ops a1 — epic schema validates a valid epic + rejects a bad status
test('epic schema validates a valid epic + rejects a bad status', () => {
  const epic = {
    schema_version: 2,
    slug: 'e',
    title: 'E',
    status: 'build',
    tasks: [{ slug: 't1', goal: 'g', status: 'pending' }],
  }
  expect(EpicNodeSchema.safeParse(epic).success).toBe(true)
  expect(EpicNodeSchema.safeParse({ ...epic, status: 'foo' }).success).toBe(false)
})

// epic-ops a2 — epic next-child over the tasks queue respects depends_on
test('epic next-child over the tasks queue respects depends_on', () => {
  expect(
    realNextChild([
      { slug: '01', status: 'pending', depends_on: [] },
      { slug: '02', status: 'pending', depends_on: ['01'] },
    ])?.slug,
  ).toBe('01')
  expect(
    realNextChild([
      { slug: '01', status: 'done' },
      { slug: '02', status: 'pending', depends_on: ['01'] },
    ])?.slug,
  ).toBe('02')
  expect(
    realNextChild([
      { slug: '01', status: 'done' },
      { slug: '02', status: 'done' },
    ]),
  ).toBeNull()
})

// epic-stages a1 — epic stages resolve from the default template
test('epic stages resolve to [discover,scaffold] / each:task / [roll-up]', () => {
  const defaultCfg = parse(
    readFileSync(new URL('../default-template/anchored.default.yml', import.meta.url), 'utf8'),
  ) as Record<string, unknown>
  const r = createResolveSteps(defaultCfg)
  expect(r.resolve('epic', 'plan').map((s) => s.name)).toEqual(['discover', 'scaffold'])
  expect(r.resolve('epic', 'build')[0]?.each).toBe('task')
  expect(r.resolve('epic', 'wrap').map((s) => s.name)).toEqual(['roll-up'])
})

// e2e-loop a1/a2 — a mini-epic loops its stubs in DAG order, epic→task→phase
function makeOps(): OpsLike {
  return {
    setStatus: async (n) => n,
    nextChild: (n) =>
      realNextChild((n.tasks ?? n.phases ?? []) as { slug: string; status: string }[]),
    setChildStatus: async (n, slug, status) => {
      const field = n.tasks ? 'tasks' : 'phases'
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

test('e2e: mini-epic loops 2 stubs in DAG order through epic→task→phase', async () => {
  const spawnCalls: string[] = []
  const engine = createEngine({
    config: {
      epic: { build: { each: 'task' } },
      task: { build: { each: 'phase' } },
      phase: { build: { steps: [{ name: 'implement', use: 'impl' }] } },
    },
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
    slug: 'mini-epic',
    status: 'build',
    tasks: [
      { slug: 't1', status: 'pending', phases: [{ slug: 'p1', status: 'pending' }] },
      {
        slug: 't2',
        status: 'pending',
        depends_on: ['t1'],
        phases: [{ slug: 'p2', status: 'pending' }],
      },
    ],
  }
  const r = await engine.run('epic', epicNode)
  expect(r.status).toBe('ok')
  // both loop edges ran; DAG order t1 before t2 (t2 depends_on t1)
  expect(spawnCalls).toEqual(['phase/p1', 'phase/p2'])
})
