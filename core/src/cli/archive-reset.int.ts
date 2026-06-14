// e2e/archive-reset.e2e.spec.ts — `anchored archive <slug>` / `anchored reset <slug>` driven
// through the real CLI argv path (parse → command → facade → io). Both verbs are
// FILE-ONLY: archive MOVES the task-file into archive/, reset REMOVES the task-file.
// Neither touches git — deleting branches is the user's own concern, not a framework
// side-effect. A fake `run` records every issued command so the tests can assert that
// archive/reset issue ZERO commands. Mirrors the in-memory file map + fake io harness.
import { test, expect } from 'bun:test'
import { buildCli } from '../index.js'
import type { IoDeps } from '../services/store/io/io.js'

function harness() {
  const files = new Map<string, string>()
  const cmds: string[] = []
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
    pathFor: (slug) => `t/.claude/tasks/${slug}.yml`,
    out: (l) => out.push(l),
    now: () => '2026-06-11',
    // recording runner: should NEVER be called by archive/reset (file-only).
    run: async (cmd) => {
      cmds.push(cmd)
      return { code: 0, stdout: '', stderr: '' }
    },
  })
  const run = async (...argv: string[]) => {
    await cli.run(argv)
    return JSON.parse(out[out.length - 1]!) as {
      ok: boolean
      result?: Record<string, unknown>
      error?: { name: string; message: string }
    }
  }
  return { run, files, cmds }
}

async function seedTask(run: ReturnType<typeof harness>['run'], slug: string) {
  const created = await run('plan', 'task', slug)
  return (created.result!.node as { slug: string }).slug
}

test('archive moves the task-file into archive/ and issues no git', async () => {
  const { run, files, cmds } = harness()
  const slug = await seedTask(run, 'my-task')
  expect(files.has(`t/.claude/tasks/${slug}.yml`)).toBe(true)

  const res = await run('archive', slug)
  expect(res.ok).toBe(true)
  expect(res.result).toMatchObject({
    slug,
    archived: true,
    to: `t/.claude/tasks/archive/${slug}.yml`,
  })
  // file relocated into archive/
  expect(files.has(`t/.claude/tasks/${slug}.yml`)).toBe(false)
  expect(files.has(`t/.claude/tasks/archive/${slug}.yml`)).toBe(true)
  // file-only: no command was ever issued
  expect(cmds).toEqual([])
})

test('reset removes the task-file and issues no git', async () => {
  const { run, files, cmds } = harness()
  const slug = await seedTask(run, 'my-task')

  const res = await run('reset', slug)
  expect(res.ok).toBe(true)
  expect(res.result).toMatchObject({ slug, reset: true })
  expect(files.has(`t/.claude/tasks/${slug}.yml`)).toBe(false)
  // file-only: no command was ever issued
  expect(cmds).toEqual([])
})

test('archive on a missing node → ok:false UnknownNode, no git and no file touch', async () => {
  const { run, files, cmds } = harness()
  const res = await run('archive', 'ghost')
  expect(res.ok).toBe(false)
  expect(res.error!.name).toBe('UnknownNode')
  expect(cmds).toEqual([])
  expect(files.has('t/.claude/tasks/ghost.yml')).toBe(false)
})

test('reset on a missing node → ok:false UnknownNode, no git and no file touch', async () => {
  const { run, files, cmds } = harness()
  const res = await run('reset', 'ghost')
  expect(res.ok).toBe(false)
  expect(res.error!.name).toBe('UnknownNode')
  expect(cmds).toEqual([])
  expect(files.has('t/.claude/tasks/ghost.yml')).toBe(false)
})

test('a `--branch` flag is ignored (file-only): archive still succeeds, no git issued', async () => {
  const { run, files, cmds } = harness()
  const slug = await seedTask(run, 'my-task')

  const res = await run('archive', slug, '--branch', 'feat/x')
  expect(res.ok).toBe(true)
  expect(res.result).toMatchObject({ slug, archived: true })
  expect(files.has(`t/.claude/tasks/archive/${slug}.yml`)).toBe(true)
  expect(cmds).toEqual([])
})
