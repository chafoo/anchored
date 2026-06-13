import { test, expect } from 'bun:test'
import { parse, stringify } from 'yaml'
import { buildCli } from '../index.js'
import { makeTierFor } from '../ops/tier-derive.js'
import type { IoDeps } from '../io/io.js'

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
      unlink: async (p) => {
        files.delete(p)
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
    JSON.parse(out[out.length - 1]!) as {
      ok: boolean
      result?: Record<string, unknown>
      error?: Record<string, unknown>
    }
  const tierFor = makeTierFor({ readFile: io.fs.readFile }, pathFor)
  return { cli, last, tierFor, files }
}

// F13 — plan epic seeds an epic-shaped node (tasks:[], status plan)
test('plan epic seeds an epic-shaped node (tasks:[], status plan)', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'epic', 'a multi-task build'])
  const node = last().result!.node as { status: string; tasks?: unknown }
  expect(node.status).toBe('plan')
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
  expect((last().result as unknown as { slug: string }[]).map((p) => p.slug)).toEqual(['p1'])
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

// q8 — `ready-children` returns the fan-out batch: ALL runnable (pending) children,
// vs next-child which returns just one. (DAG-gating by depends_on is unit-tested in
// children.spec — set-field can't author the array here.)
test('q8: node ready-children returns all runnable children for parallel fan-out', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'epic', 'fanout'])
  await cli.run(['node', 'add-child', 'fanout', 'feat-a'])
  await cli.run(['node', 'add-child', 'fanout', 'feat-b'])
  // both pending + no deps → both in the fan-out batch
  await cli.run(['node', 'ready-children', 'fanout'])
  expect((last().result as unknown as { slug: string }[]).map((c) => c.slug)).toEqual([
    'feat-a',
    'feat-b',
  ])
  // marking one done leaves only the other runnable
  await cli.run(['node', 'set-child-status', 'fanout', 'feat-a', 'done'])
  await cli.run(['node', 'ready-children', 'fanout'])
  expect((last().result as unknown as { slug: string }[]).map((c) => c.slug)).toEqual(['feat-b'])
})

// G6 — `question-list` convenience verb: all questions, or filtered by status,
// so agents stop parsing the YAML by hand to find the open ones.
test('G6: node question-list returns questions, optionally filtered by status', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'task', 'qtest'])
  await cli.run(['node', 'add-question', 'qtest', 'first?', 'high'])
  await cli.run(['node', 'add-question', 'qtest', 'second?', 'low'])
  await cli.run(['node', 'resolve-question', 'qtest', 'q1', 'yes', 'user'])

  await cli.run(['node', 'question-list', 'qtest'])
  expect((last().result as unknown as { id: string }[]).map((q) => q.id)).toEqual(['q1', 'q2'])

  await cli.run(['node', 'question-list', 'qtest', 'open'])
  expect((last().result as unknown as { id: string }[]).map((q) => q.id)).toEqual(['q2'])

  await cli.run(['node', 'question-list', 'qtest', '--status', 'resolved'])
  expect((last().result as unknown as { id: string }[]).map((q) => q.id)).toEqual(['q1'])
})

// D2 — outcome-level task-ACs live on the stub (acceptance_criteria), and the
// SAME generic child-AC verbs (add-ac → auto-id, add-phase-evidence → done+evidence)
// work on an epic stub unchanged. These are the contract the wrap roll-up checks.
test('D2: add-ac + add-phase-evidence work on an epic task-stub', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'epic', 'd2 epic'])
  await cli.run(['node', 'add-child', 'd2-epic', 'core-list', 'the foundation'])
  // epic-refine authors an outcome-AC on the stub (id auto-assigned a1)
  await cli.run(['node', 'add-ac', 'd2-epic', 'core-list', 'persistence to localStorage works'])
  await cli.run(['node', 'read', 'd2-epic'])
  const stub = (
    last().result as {
      tasks: { slug: string; acceptance_criteria?: { id: string; status: string }[] }[]
    }
  ).tasks[0]!
  expect(stub.acceptance_criteria?.[0]?.id).toBe('a1')
  expect(stub.acceptance_criteria?.[0]?.status).toBe('pending')
  // the roll-up marks it satisfied WITH evidence (same invariant, one tier up)
  await cli.run([
    'node',
    'add-phase-evidence',
    'd2-epic',
    'core-list',
    'a1',
    'core-list.yml persistence phase done',
  ])
  await cli.run(['node', 'read', 'd2-epic'])
  const done = (
    last().result as { tasks: { acceptance_criteria: { status: string; evidence: string[] }[] }[] }
  ).tasks[0]!
  expect(done.acceptance_criteria[0]?.status).toBe('done')
  expect(done.acceptance_criteria[0]?.evidence).toEqual(['core-list.yml persistence phase done'])
})

// D1 — the epic walks the FULL task-symmetric lifecycle through the CLI, and
// carries the same context trails as a task (plan/refine/build/wrap prose).
test('D1: epic walks plan→drafted→refined→build→wrap→done legally via the CLI', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'epic', 'lifecycle epic'])
  const slug = 'lifecycle-epic'
  expect((last().result!.node as { status: string }).status).toBe('plan') // seeded at plan

  // epic carries a context trail (D1 schema change)
  await cli.run(['node', 'set-field', slug, 'context.plan', 'the epic plan trail'])
  expect(last().ok).toBe(true)

  for (const to of ['drafted', 'refined', 'build', 'wrap', 'done']) {
    await cli.run(['node', 'set-status', slug, to])
    expect(last().ok).toBe(true) // each forward edge is legal on the epic
    await cli.run(['node', 'read', slug])
    expect((last().result as { status: string }).status).toBe(to)
  }
  await cli.run(['node', 'read', slug])
  expect((last().result as { context?: { plan?: string } }).context?.plan).toBe(
    'the epic plan trail',
  )
})

// H5 — set-field normalizes literal '\n' (as bash passes it) in a context trail to
// real newlines, so the renderer emits a readable block scalar, not one escaped line.
test('H5: set-field normalizes literal backslash-n in a context trail', async () => {
  const { cli, last, files } = harness()
  await cli.run(['plan', 'task', 'h5'])
  // the TS literal '\\n' is backslash+n — exactly what bash double-quotes pass through
  await cli.run(['node', 'set-field', 'h5', 'context.wrap', 'line one\\nline two\\nline three'])
  expect(last().ok).toBe(true)
  await cli.run(['node', 'read', 'h5'])
  expect((last().result as { context: { wrap: string } }).context.wrap).toBe(
    'line one\nline two\nline three', // real newlines after normalization
  )
  expect(files.get('t/h5.yml')!).toMatch(/wrap: [|>]/) // rendered as a block scalar
})

// H7 — the node's own acceptance[] (epic integration DoD): add-acceptance appends an
// item (auto-id e1, e2), set-acceptance-status flips it.
test('H7: add-acceptance + set-acceptance-status on an epic integration AC', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'epic', 'h7'])
  await cli.run([
    'node',
    'add-acceptance',
    'h7',
    'core-list and clear-completed stay in sync after a clear',
  ])
  await cli.run(['node', 'read', 'h7'])
  const acc = (last().result as { acceptance?: { id: string; status: string }[] }).acceptance!
  expect(acc[0]?.id).toBe('e1')
  expect(acc[0]?.status).toBe('pending')
  // M3: done now requires delivery evidence
  await cli.run(['node', 'set-acceptance-status', 'h7', 'e1', 'done'])
  expect(last().ok).toBe(false) // no evidence → rejected
  await cli.run([
    'node',
    'set-acceptance-status',
    'h7',
    'e1',
    'done',
    'core-list/persistence — delivered',
  ])
  await cli.run(['node', 'read', 'h7'])
  expect((last().result as { acceptance: { status: string }[] }).acceptance[0]?.status).toBe('done')
})

// F2 — add-child seeds depends_on (4th arg, CSV); set-child-field edits a child
// field post-hoc. The DAG edge had no CLI setter and had to be hand-edited.
test('F2: add-child depends_on + set-child-field on a stub', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'epic', 'f2'])
  await cli.run(['node', 'add-child', 'f2', 'core-list', 'root'])
  await cli.run(['node', 'add-child', 'f2', 'clear-completed', 'feature', 'core-list'])
  await cli.run(['node', 'read', 'f2'])
  const tasks = (last().result as { tasks: { slug: string; depends_on?: string[] }[] }).tasks
  expect(tasks.find((t) => t.slug === 'clear-completed')?.depends_on).toEqual(['core-list'])

  // ready-children gates clear-completed behind its dependency
  await cli.run(['node', 'ready-children', 'f2'])
  expect((last().result as unknown as { slug: string }[]).map((t) => t.slug)).toEqual(['core-list'])

  // set-child-field edits the goal of an existing stub
  await cli.run(['node', 'set-child-field', 'f2', 'core-list', 'goal', 'new goal'])
  await cli.run(['node', 'read', 'f2'])
  const cl = (last().result as { tasks: { slug: string; goal?: string }[] }).tasks
  expect(cl.find((t) => t.slug === 'core-list')?.goal).toBe('new goal')

  // set-child-field JSON-parses an array value (depends_on set post-hoc)
  await cli.run(['node', 'set-child-field', 'f2', 'clear-completed', 'depends_on', '["core-list"]'])
  await cli.run(['node', 'read', 'f2'])
  const t2 = (last().result as { tasks: { slug: string; depends_on?: string[] }[] }).tasks
  expect(t2.find((t) => t.slug === 'clear-completed')?.depends_on).toEqual(['core-list'])
})

// Q1 (harden-1) — status is reserved: a raw set-field / set-child-field can NOT
// teleport a node or child to done, bypassing transitions + the evidence invariant.
test('Q1: set-field status + set-child-field status are rejected (ReservedField)', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'task', 'reserve-test'])
  await cli.run(['node', 'set-field', 'reserve-test', 'status', 'done'])
  expect(last().ok).toBe(false)
  expect((last().error as { name: string }).name).toBe('ReservedField')
  // status untouched
  await cli.run(['node', 'read', 'reserve-test'])
  expect((last().result as { status: string }).status).toBe('plan')

  // child status too
  await cli.run(['node', 'add-phase', 'reserve-test', 'p1', 'P1'])
  await cli.run(['node', 'set-child-field', 'reserve-test', 'p1', 'status', 'done'])
  expect(last().ok).toBe(false)
  expect((last().error as { name: string }).name).toBe('ReservedField')
})

// F3 — an explicit --slug overrides the slug derived from the (long) description.
test('F3: plan --slug gives a clean slug instead of slugifying the prose', async () => {
  const { cli, last } = harness()
  await cli.run([
    'plan',
    'epic',
    '--slug',
    'tasks-app',
    'a deliberately long description that would otherwise produce an ugly truncated slug',
  ])
  expect((last().result!.node as { slug: string }).slug).toBe('tasks-app')
  // the long prose still becomes the title
  expect((last().result!.node as { title: string }).title).toContain('deliberately long')
})

// harden-3 — a concern raised during build blocks `done` until resolved (the
// "nothing open stays open" floor; concerns are walked + resolved at wrap).
test('harden-3: an open concern blocks done; resolving it frees done', async () => {
  const { cli, last } = harness()
  await cli.run(['plan', 'task', 'concern-test'])
  for (const s of ['drafted', 'refined', 'build', 'wrap']) {
    await cli.run(['node', 'set-status', 'concern-test', s])
  }
  await cli.run(['node', 'add-concern', 'concern-test', 'gate X failed', 'high'])
  await cli.run(['node', 'concern-list', 'concern-test', 'open'])
  expect((last().result as unknown as { id: string }[])[0]?.id).toBe('c1')

  await cli.run(['node', 'set-status', 'concern-test', 'done'])
  expect(last().ok).toBe(false)
  expect((last().error as { name: string }).name).toBe('ConcernsOpen')

  await cli.run(['node', 'resolve-concern', 'concern-test', 'c1', 'fixed it', 'user'])
  await cli.run(['node', 'set-status', 'concern-test', 'done'])
  expect(last().ok).toBe(true) // concern resolved → done now allowed
})
