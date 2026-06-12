// lifecycle.e2e.spec.ts — `anchored archive <slug>` / `anchored reset <slug>` driven
// through the real CLI argv path (parse → command → facade → io) with a fake `run`
// that records the issued git commands. archive MOVES the task-file + deletes the
// task branch(es); reset REMOVES the file + deletes the branch(es). develop/main are
// NEVER targeted. Mirrors the lifecycle-e2e harness (in-memory file map + fake io).
import { test, expect } from 'bun:test'
import { buildCli } from '../../index.js'
import type { IoDeps } from '../../io.js'

function harness() {
  const files = new Map<string, string>()
  const gitCmds: string[] = []
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
    // fake git: record every issued command, always succeed (exit 0)
    run: async (cmd) => {
      gitCmds.push(cmd)
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
  return { run, files, gitCmds }
}

async function seedTask(run: ReturnType<typeof harness>['run'], slug: string) {
  const created = await run('plan', 'task', slug)
  return (created.result!.node as { slug: string }).slug
}

test('archive moves the task-file and deletes the default task/<slug> branch', async () => {
  const { run, files, gitCmds } = harness()
  const slug = await seedTask(run, 'my-task')
  expect(files.has(`t/.claude/tasks/${slug}.yml`)).toBe(true)

  const res = await run('archive', slug)
  expect(res.ok).toBe(true)
  expect(res.result).toMatchObject({
    slug,
    archived: true,
    branchesDeleted: [`task/${slug}`],
    to: `t/.claude/tasks/archive/${slug}.yml`,
  })
  // file relocated into archive/
  expect(files.has(`t/.claude/tasks/${slug}.yml`)).toBe(false)
  expect(files.has(`t/.claude/tasks/archive/${slug}.yml`)).toBe(true)
  // the default branch was force-deleted
  expect(gitCmds).toContain(`git branch -D task/${slug}`)
})

test('reset removes the task-file and deletes the default branch', async () => {
  const { run, files, gitCmds } = harness()
  const slug = await seedTask(run, 'my-task')

  const res = await run('reset', slug)
  expect(res.ok).toBe(true)
  expect(res.result).toMatchObject({ slug, reset: true, branchesDeleted: [`task/${slug}`] })
  expect(files.has(`t/.claude/tasks/${slug}.yml`)).toBe(false)
  expect(gitCmds).toContain(`git branch -D task/${slug}`)
})

test('--branch x --branch y deletes both explicit branches (and not the default)', async () => {
  const { run, gitCmds } = harness()
  const slug = await seedTask(run, 'my-task')

  const res = await run('archive', slug, '--branch', 'feat/x', '--branch', 'feat/y')
  expect(res.ok).toBe(true)
  expect(res.result!.branchesDeleted).toEqual(['feat/x', 'feat/y'])
  expect(gitCmds).toContain('git branch -D feat/x')
  expect(gitCmds).toContain('git branch -D feat/y')
  // explicit list overrides the task/<slug> default
  expect(gitCmds).not.toContain(`git branch -D task/${slug}`)
})

test('develop and main are never targeted by archive or reset', async () => {
  const { run, gitCmds } = harness()
  const slug = await seedTask(run, 'my-task')
  // even if a caller names them explicitly, they are filtered out (never deleted)
  await run('archive', slug, '--branch', 'develop', '--branch', 'main', '--branch', 'feat/ok')
  await run('reset', slug, '--branch', 'main')
  const offending = gitCmds.filter((c) => /\b(develop|main)\b/.test(c))
  expect(offending).toEqual([])
  expect(gitCmds).toContain('git branch -D feat/ok')
})

test('archive on a missing node → ok:false UnknownNode, no git issued', async () => {
  const { run, gitCmds } = harness()
  const res = await run('archive', 'ghost')
  expect(res.ok).toBe(false)
  expect(res.error!.name).toBe('UnknownNode')
  expect(gitCmds).toEqual([])
})

test('a non-zero git exit (branch absent) is tolerated — archive still succeeds', async () => {
  const files = new Map<string, string>()
  const io: IoDeps = {
    fs: {
      mkdir: async () => undefined,
      writeFile: async (p, d) => void files.set(p, d),
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
      unlink: async (p) => void files.delete(p),
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
    run: async () => ({ code: 1, stdout: '', stderr: "error: branch 'task/x' not found." }),
  })
  await cli.run(['plan', 'task', 'my-task'])
  out.length = 0
  await cli.run(['archive', 'my-task'])
  const env = JSON.parse(out[out.length - 1]!) as { ok: boolean; result?: { archived: boolean } }
  expect(env.ok).toBe(true)
  expect(env.result!.archived).toBe(true)
})

test('without a run seam, git is skipped with a note in the result', async () => {
  const files = new Map<string, string>()
  const io: IoDeps = {
    fs: {
      mkdir: async () => undefined,
      writeFile: async (p, d) => void files.set(p, d),
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
      unlink: async (p) => void files.delete(p),
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
    // no `run` — git unavailable
  })
  await cli.run(['plan', 'task', 'my-task'])
  out.length = 0
  await cli.run(['reset', 'my-task'])
  const env = JSON.parse(out[out.length - 1]!) as {
    ok: boolean
    result?: { reset: boolean; branchesDeleted: string[]; note?: string }
  }
  expect(env.ok).toBe(true)
  expect(env.result!.reset).toBe(true)
  expect(env.result!.branchesDeleted).toEqual([])
  expect(env.result!.note).toMatch(/git/i)
})
