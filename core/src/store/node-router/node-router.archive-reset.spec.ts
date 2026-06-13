// node-router.archive-reset.spec.ts — archive(slug) MOVES the task-file into archive/,
// reset(slug) REMOVES it. Both touch the substrate only (io + pathFor) — NO git
// (that's the command's job). A missing file throws a typed UnknownNode.
import { test, expect } from 'bun:test'
import { createSlugFacade, type TierOps } from './node-router.js'

// a minimal TierOps stub — archive/reset don't route through the tier-ops at all,
// so these are never called; present only to satisfy the facade wiring.
function stubOps(): TierOps {
  const die = () => {
    throw new Error('tier-op should not be called by archive/reset')
  }
  return new Proxy({}, { get: () => die }) as unknown as TierOps
}

function harness() {
  const files = new Map<string, string>()
  const calls: string[] = []
  const pathFor = (slug: string) => `t/.claude/tasks/${slug}.yml`
  const io = {
    async readFile(p: string) {
      const d = files.get(p)
      if (d === undefined) throw new Error(`ENOENT: ${p}`)
      return d
    },
    async move(from: string, to: string) {
      calls.push(`move:${from}->${to}`)
      const d = files.get(from)
      files.delete(from)
      if (d !== undefined) files.set(to, d)
    },
    async remove(p: string) {
      calls.push(`remove:${p}`)
      files.delete(p)
    },
  }
  const facade = createSlugFacade({
    opsFor: () => stubOps(),
    tierFor: async () => 'task',
    defaultStatus: { task: 'plan' },
    pathFor,
    io,
  })
  return { facade, files, calls, pathFor }
}

test('archive moves the task-file into archive/<slug>.yml and reports the destination', async () => {
  const { facade, files, calls } = harness()
  files.set('t/.claude/tasks/my-task.yml', 'slug: my-task\nstatus: done\n')
  const res = (await facade.archive('my-task')) as {
    slug: string
    archived: boolean
    to: string
  }
  expect(res).toEqual({
    slug: 'my-task',
    archived: true,
    to: 't/.claude/tasks/archive/my-task.yml',
  })
  expect(files.has('t/.claude/tasks/my-task.yml')).toBe(false)
  expect(files.get('t/.claude/tasks/archive/my-task.yml')).toBe('slug: my-task\nstatus: done\n')
  expect(calls).toEqual(['move:t/.claude/tasks/my-task.yml->t/.claude/tasks/archive/my-task.yml'])
})

test('reset removes the task-file entirely', async () => {
  const { facade, files, calls } = harness()
  files.set('t/.claude/tasks/my-task.yml', 'slug: my-task\n')
  const res = (await facade.reset('my-task')) as { slug: string; reset: boolean }
  expect(res).toEqual({ slug: 'my-task', reset: true })
  expect(files.has('t/.claude/tasks/my-task.yml')).toBe(false)
  expect(calls).toEqual(['remove:t/.claude/tasks/my-task.yml'])
})

test('archive on a missing file throws UnknownNode (no silent success)', async () => {
  const { facade } = harness()
  await expect(facade.archive('ghost')).rejects.toMatchObject({ name: 'UnknownNode' })
})

test('reset on a missing file throws UnknownNode (no silent success)', async () => {
  const { facade } = harness()
  await expect(facade.reset('ghost')).rejects.toMatchObject({ name: 'UnknownNode' })
})
