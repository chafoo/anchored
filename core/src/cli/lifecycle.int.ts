// e2e/lifecycle-e2e.spec.ts — G11. Drive the FULL lifecycle of BOTH tiers through the
// real CLI argv path (parse → facade → validating substrate → atomic-write), and
// re-read after EVERY step. This is the regression net the unit tests lacked: the
// old e2e never re-read after a mutation, never drove the epic each:task loop, and
// never asserted that an invalid write is REJECTED at the op (the G1/G2 hole).
import { test, expect } from 'bun:test'
import { buildCli } from '../index.js'
import type { IoDeps } from '../io/io.js'

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
  const cli = buildCli({
    io,
    pathFor: (slug) => `t/${slug}.yml`,
    out: (l) => out.push(l),
    now: () => '2026-06-11',
  })
  // run a CLI argv and return its parsed JSON envelope (the same shape agents see)
  const run = async (...argv: string[]) => {
    await cli.run(argv)
    return JSON.parse(out[out.length - 1]!) as {
      ok: boolean
      result?: Record<string, unknown> & {
        status?: string
        slug?: string
        node?: { slug: string; status: string }
        phases?: { slug: string; status: string; acceptance_criteria?: { status: string }[] }[]
        tasks?: { slug: string; status: string }[]
      }
      error?: { name: string }
    }
  }
  return { run }
}

// G11-a1 — a TASK walks plan→drafted→refined→build→wrap→done through the CLI; the
// state is re-read after every transition (and the phase is built via the same
// substrate verbs the build skill drives).
test('G11: task walks the full lifecycle through the CLI, re-reading every step', async () => {
  const { run } = harness()
  const created = await run('plan', 'task', 'a tracked task')
  const slug = created.result!.node!.slug
  expect(created.result!.node!.status).toBe('plan')

  await run('node', 'add-phase', slug, 'p1', 'Phase 1')
  await run('node', 'add-ac', slug, 'p1', 'it works')

  for (const to of ['drafted', 'refined', 'build']) {
    expect((await run('node', 'set-status', slug, to)).ok).toBe(true)
    expect((await run('node', 'read', slug)).result!.status).toBe(to) // re-read confirms persistence
  }

  // build the phase exactly as the build skill does (mark in-flight → evidence → done)
  await run('node', 'set-child-status', slug, 'p1', 'in-progress')
  await run('node', 'add-phase-evidence', slug, 'p1', 'a1', 'app.ts:1 — done')
  expect((await run('node', 'set-child-status', slug, 'p1', 'done')).ok).toBe(true)
  const built = await run('node', 'read', slug)
  expect(built.result!.phases![0]!.status).toBe('done')
  expect(built.result!.phases![0]!.acceptance_criteria![0]!.status).toBe('done')

  for (const to of ['wrap', 'done']) {
    expect((await run('node', 'set-status', slug, to)).ok).toBe(true)
    expect((await run('node', 'read', slug)).result!.status).toBe(to)
  }
})

// G11-a2 — an EPIC walks the full symmetric lifecycle AND drives the each:task loop
// (next-child → active → done) with outcome-ACs on the stubs, through the CLI.
test('G11: epic walks the full lifecycle + each:task loop through the CLI', async () => {
  const { run } = harness()
  await run('plan', 'epic', 'an epic')
  const slug = 'an-epic'
  await run('node', 'add-child', slug, 'core', 'foundation')
  await run('node', 'add-child', slug, 'feature', 'a feature')
  await run('node', 'add-ac', slug, 'core', 'persistence works') // outcome-AC on the stub

  for (const to of ['drafted', 'refined', 'build']) {
    expect((await run('node', 'set-status', slug, to)).ok).toBe(true)
    expect((await run('node', 'read', slug)).result!.status).toBe(to)
  }

  // each:task loop — next-child yields the ready child; mark it active (tier-correct
  // word, G2), satisfy its outcome-AC, mark it done; repeat until the queue drains.
  let nc = await run('node', 'next-child', slug)
  expect(nc.result!.slug).toBe('core')
  expect((await run('node', 'set-child-status', slug, 'core', 'active')).ok).toBe(true)
  await run('node', 'add-phase-evidence', slug, 'core', 'a1', 'core-list.yml — delivered')
  await run('node', 'set-child-status', slug, 'core', 'done')

  nc = await run('node', 'next-child', slug)
  expect(nc.result!.slug).toBe('feature') // advanced
  await run('node', 'set-child-status', slug, 'feature', 'active')
  await run('node', 'set-child-status', slug, 'feature', 'done')

  nc = await run('node', 'next-child', slug)
  expect(nc.result ?? null).toBeNull() // queue drained

  for (const to of ['wrap', 'done']) {
    expect((await run('node', 'set-status', slug, to)).ok).toBe(true)
  }
  expect((await run('node', 'read', slug)).result!.status).toBe('done')
})

// G11-a3 — an invalid mutation returns ok:false AT the op (not a brick on next read);
// the node stays re-readable + intact. Both the G2 op-guard and the G1 persist net.
test('G11: an invalid write is rejected at the op; the node stays re-readable', async () => {
  const { run } = harness()
  await run('plan', 'epic', 'guarded')
  await run('node', 'add-child', 'guarded', 't1', 'g')

  // (a) the dogfood corruption — a phase word on an epic stub → InvalidChildStatus
  const badStatus = await run('node', 'set-child-status', 'guarded', 't1', 'in-progress')
  expect(badStatus.ok).toBe(false)
  expect(badStatus.error!.name).toBe('InvalidChildStatus')

  // (b) an unknown top-level field → InvalidNode at persist's full-node validation
  const badField = await run('node', 'set-field', 'guarded', 'bogus-field', 'x')
  expect(badField.ok).toBe(false)
  expect(badField.error!.name).toBe('InvalidNode')

  // the node is untouched + still re-readable (no brick)
  const read = await run('node', 'read', 'guarded')
  expect(read.ok).toBe(true)
  expect(read.result!.tasks![0]!.status).toBe('pending')
})
