import { test, expect } from 'bun:test'
import { parse, stringify } from 'yaml'
import { buildCli } from '../index.js'
import { makeTierFor } from '../ops/tier-derive.js'
import type { IoDeps } from '../io.js'

// in-memory io + a cli wired to it (the real facade + tier-derivation)
function harness() {
  const files = new Map<string, string>()
  const io: IoDeps = {
    fs: {
      mkdir: async () => undefined,
      writeFile: async (p, d) => {
        files.set(p, d)
      },
      rename: async (f, t) => {
        const d = files.get(f)
        files.delete(f)
        if (d !== undefined) files.set(t, d)
      },
      readFile: async (p) => {
        const d = files.get(p)
        if (d === undefined) throw new Error('ENOENT')
        return d
      },
    },
    lock: { acquire: async () => async () => {} },
    rand: () => 'r',
    pid: () => 1,
  }
  const out: string[] = []
  const pathFor = (slug: string) => `t/${slug}.yml`
  const cli = buildCli({ io, pathFor, out: (l) => out.push(l), now: () => '2026-06-11' })
  const last = () =>
    JSON.parse(out[out.length - 1]!) as { ok: boolean; result?: Record<string, unknown> }
  const tierFor = makeTierFor({ readFile: io.fs.readFile }, pathFor)
  return { cli, last, tierFor, files }
}

// F13 — plan epic seeds an epic-shaped node (tasks:[], status planning)
test('plan epic seeds an epic-shaped node (tasks:[], status planning)', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'epic', 'a multi-task build'])
  const node = last().result!.node as { status: string; tasks?: unknown }
  expect(node.status).toBe('planning')
  expect(Array.isArray(node.tasks)).toBe(true) // epic shape seeded
})

// F13 — the tier is derived from FILE content (tasks[]→epic, phases[]→task)
test('makeTierFor derives the tier from file content', async () => {
  const { cli, tierFor } = harness()
  await cli.run(['plan', 'epic', 'an epic'])
  await cli.run(['plan', 'task', 'a task'])
  expect(await tierFor('an-epic')).toBe('epic')
  expect(await tierFor('a-task')).toBe('task')
  expect(await tierFor('does-not-exist')).toBe('task') // missing file → default
})

// F13 — add-child writes a task stub on an epic; next-child loops them in DAG order
test('epic round-trip: add-child stubs + next-child loops them', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'epic', 'roundtrip'])
  await cli.run(['node', 'add-child', 'roundtrip', 't1', 'first goal'])
  await cli.run(['node', 'add-child', 'roundtrip', 't2']) // goal optional
  await cli.run(['node', 'read', 'roundtrip'])
  const tasks = (last().result! as { tasks: { slug: string }[] }).tasks
  expect(tasks.map((t) => t.slug)).toEqual(['t1', 't2'])

  await cli.run(['node', 'next-child', 'roundtrip'])
  expect((last().result as { slug: string }).slug).toBe('t1')
  await cli.run(['node', 'set-child-status', 'roundtrip', 't1', 'done'])
  await cli.run(['node', 'next-child', 'roundtrip'])
  expect((last().result as { slug: string }).slug).toBe('t2') // advanced
})

// context-polish F3/F4 — create stamps `created` via the clock seam; list-phases returns phases
test('create stamps created via the clock seam; node list-phases returns phases', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'task', 'a task'])
  expect((last().result!.node as { created?: string }).created).toBe('2026-06-11')
  await cli.run(['node', 'add-phase', 'a-task', 'p1', 'P1'])
  await cli.run(['node', 'list-phases', 'a-task'])
  expect((last().result as { slug: string }[]).map((p) => p.slug)).toEqual(['p1'])
})

// F14 — slug generation never leaves a trailing dash, even for a long title cut mid-word
test('slug has no trailing dash for a long title cut mid-word', async () => {
  const { cli, last } = harness()
  const longTitle =
    'this title is deliberately long so the forty-eight char cut lands inside a word abcdef'
  await cli.run(['plan', 'task', longTitle])
  const slug = (last().result!.node as { slug: string }).slug
  expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) // valid kebab, no trailing dash
})

// round-trip safety: an epic node with a stub renders + re-parses losslessly
test('epic node with a stub round-trips through render+parse', async () => {
  const { cli, files } = harness()
  await cli.run(['plan', 'epic', 'rt'])
  await cli.run(['node', 'add-child', 'rt', 't1', 'g'])
  const raw = files.get('t/rt.yml')!
  expect(parse(raw)).toEqual(parse(stringify(parse(raw)))) // stable
})
