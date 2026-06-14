// _v3 cli/lifecycle.e2e.ts — the full fractal walk, end to end, on the REAL filesystem, with
// NO AI. Drives an epic with 2 child tasks all the way to `done` purely through CLI verbs:
// epic → 2 task-stubs + a DoD item; each task → phases → ACs evidenced → done; the epic stubs
// flipped done; roll-up; the DoD item evidenced; epic done. This proves the whole state
// machine + the evidence gates + the completion floors + roll-up actually compose.
import { test, expect } from 'bun:test'
import { mkdtemp, readFile, writeFile, rename, unlink, mkdir, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'
import { createCli } from './cli.js'
import type { FileSystem } from '../lib/contracts/fs.js'

const DEFAULT = `
task:
  build:
    each: phase
    retry_limit: 3
epic:
  build:
    each: task
    retry_limit: 3
`

async function makeCli() {
  const dir = await mkdtemp(join(tmpdir(), 'anchored-life-'))
  const out: string[] = []
  const fs: FileSystem = {
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: (p, d) => writeFile(p, d),
    rename: (a, b) => rename(a, b),
    unlink: (p) => unlink(p),
    mkdir: (d, o) => mkdir(d, o),
    stat: async (p) => {
      try {
        const s = await stat(p)
        return `${s.mtimeMs}:${s.size}`
      } catch {
        return undefined
      }
    },
  }
  const cli = createCli({
    fs,
    lock: { acquire: async () => async () => {} },
    yaml: { parse: (r, o) => parse(r, o), stringify: (v, o) => stringify(v, o) },
    pathFor: (slug) => join(dir, `${slug}.yml`),
    rand: () => 'r',
    pid: () => 1,
    readDefault: () => DEFAULT,
    readUser: () => undefined,
    parseYaml: (r) => parse(r),
    projectRoot: dir,
    out: (l) => out.push(l),
    version: '1.0.0',
  })

  // run a verb; throw with the error envelope if it failed (so the test fails LOUD + located)
  const ok = async (...argv: string[]): Promise<unknown> => {
    const code = await cli.run(argv)
    const env = JSON.parse(out[out.length - 1]!) as {
      ok: boolean
      result?: unknown
      error?: unknown
    }
    if (!env.ok || code !== 0)
      throw new Error(`'${argv.join(' ')}' failed: ${JSON.stringify(env.error)}`)
    return env.result
  }
  const readNode = async (slug: string) => parse(await readFile(join(dir, `${slug}.yml`), 'utf8'))
  return { ok, readNode, cli, out, dir }
}

test('e2e: an epic with 2 tasks driven all the way to done — no AI, real filesystem', async () => {
  const { ok, readNode, dir } = await makeCli()
  try {
    // ── epic: create + queue two task-stubs + a definition-of-done item ──
    await ok('epic', 'create', 'my-epic', 'Auth system')
    await ok('epic', 'child-add', 'my-epic', 'login', 'login flow')
    await ok('epic', 'child-add', 'my-epic', 'logout', 'logout flow')
    await ok('epic', 'add-acceptance', 'my-epic', 'auth works end to end') // e1
    await ok('epic', 'status', 'my-epic', 'drafted')
    await ok('epic', 'status', 'my-epic', 'refined')
    await ok('epic', 'status', 'my-epic', 'build')

    // ── build each child task to done (the fractal recursion, done by hand) ──
    for (const t of ['login', 'logout']) {
      const slug = `my-epic/${t}`
      await ok('task', 'create', slug, t)
      await ok('task', 'add-phase', slug, 'setup', 'Setup')
      await ok('task', 'status', slug, 'drafted')
      await ok('task', 'status', slug, 'refined')
      await ok('task', 'status', slug, 'build')

      // work the phase: add an AC → it cannot be done without evidence → evidence flips it done
      await ok('phase', 'status', `${slug}/setup`, 'in-progress')
      await ok('phase', 'ac-add', `${slug}/setup`, 'the handler is validated') // a1
      await ok('phase', 'ac-evidence', `${slug}/setup`, 'a1', `src/${t}.ts:1 — tested`)
      await ok('phase', 'status', `${slug}/setup`, 'done')

      // the task can only reach done now that every phase is terminal
      await ok('task', 'status', slug, 'wrap')
      await ok('task', 'status', slug, 'done')

      // flip the epic's task-stub done (the loop-queue marker)
      await ok('epic', 'child-status', 'my-epic', t, 'done')
    }

    // ── epic finish: roll-up reads the child task files; DoD item needs delivery evidence ──
    const rollup = (await ok('epic', 'roll-up', 'my-epic')) as {
      children: { childStatus: string }[]
    }
    expect(rollup.children.map((c) => c.childStatus)).toEqual(['done', 'done'])
    await ok('epic', 'set-acceptance-status', 'my-epic', 'e1', 'done', 'login+logout — delivered')
    await ok('epic', 'status', 'my-epic', 'wrap')
    await ok('epic', 'status', 'my-epic', 'done')

    // ── assert the real files on disk reflect a fully-built epic ──
    const epic = (await readNode('my-epic')) as {
      status: string
      tasks: { status: string }[]
      acceptance: { status: string; evidence?: string[] }[]
    }
    expect(epic.status).toBe('done')
    expect(epic.tasks.map((t) => t.status)).toEqual(['done', 'done'])
    expect(epic.acceptance[0]).toMatchObject({
      status: 'done',
      evidence: ['login+logout — delivered'],
    })

    const login = (await readNode('my-epic/login')) as {
      status: string
      phases: { status: string; acceptance_criteria: { status: string; evidence?: string[] }[] }[]
    }
    expect(login.status).toBe('done')
    expect(login.phases[0]!.status).toBe('done')
    expect(login.phases[0]!.acceptance_criteria[0]).toMatchObject({ status: 'done' })
    expect(login.phases[0]!.acceptance_criteria[0]!.evidence).toEqual(['src/login.ts:1 — tested'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// guardrail: prove the evidence gate is REAL — no AI can fake a "done" through the CLI
test('e2e: the evidence gate blocks a premature done', async () => {
  const { ok, cli, out, dir } = await makeCli()
  const lastOk = () => (JSON.parse(out[out.length - 1]!) as { ok: boolean }).ok
  try {
    await ok('task', 'create', 'solo', 'Solo')
    await ok('task', 'add-phase', 'solo', 'p1', 'P1')
    await ok('phase', 'ac-add', 'solo/p1', 'must be backed') // a1, status pending, no evidence

    // ac-done WITHOUT evidence → the schema refuses a done AC with no evidence (exit 1)
    expect(await cli.run(['phase', 'ac-done', 'solo/p1', 'a1'])).toBe(1)
    expect(lastOk()).toBe(false)

    // and the phase itself can't be marked done while the AC is unbacked
    await ok('phase', 'status', 'solo/p1', 'in-progress')
    expect(await cli.run(['phase', 'status', 'solo/p1', 'done'])).toBe(1)
    expect(lastOk()).toBe(false)

    // evidence flips it — and only THEN does done go through
    await ok('phase', 'ac-evidence', 'solo/p1', 'a1', 'src/solo.ts:9 — proof')
    await ok('phase', 'status', 'solo/p1', 'done')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
