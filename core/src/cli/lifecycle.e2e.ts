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

// requirements-3 enforcement, end to end through the REAL CLI: questions-block-build,
// the optional-stage skip edges, the order-jump rejection, and deferred-AC (reason-gated,
// terminal). All on the real filesystem, no AI.
test('e2e: questions block build · optional skips · deferred AC — real CLI', async () => {
  const { ok, cli, out, readNode, dir } = await makeCli()
  const lastOk = () => (JSON.parse(out[out.length - 1]!) as { ok: boolean }).ok
  const statusOf = async (slug: string) => ((await readNode(slug)) as { status: string }).status
  try {
    await ok('task', 'create', 'rt', 'R')
    await ok('task', 'add-phase', 'rt', 'p1', 'P1')

    // order cannot jump: plan → build is illegal (drafted is not optional)
    expect(await cli.run(['task', 'status', 'rt', 'build'])).toBe(1)
    expect(lastOk()).toBe(false)

    await ok('task', 'status', 'rt', 'drafted')

    // §5 — an open question blocks the advance to build (with a listing message)
    await ok('task', 'question-add', 'rt', 'which storage?', 'high')
    expect(await cli.run(['task', 'status', 'rt', 'build'])).toBe(1)
    expect(lastOk()).toBe(false)
    const blocked = JSON.parse(out[out.length - 1]!) as { error?: { name?: string } }
    expect(blocked.error?.name).toBe('QuestionsOpen')

    // resolve it → the skip-refine edge drafted → build now goes through
    await ok('task', 'question-resolve', 'rt', 'q1', 'localStorage', 'user')
    await ok('task', 'status', 'rt', 'build')
    expect(await statusOf('rt')).toBe('build')

    // §3 — a deferred AC is reason-gated and then terminal (the phase finishes without evidence on it)
    await ok('phase', 'status', 'rt/p1', 'in-progress')
    await ok('phase', 'ac-add', 'rt/p1', 'nice-to-have polish') // a1
    expect(await cli.run(['phase', 'ac-defer', 'rt/p1', 'a1'])).toBe(1) // no reason → rejected
    expect(lastOk()).toBe(false)
    await ok('phase', 'ac-defer', 'rt/p1', 'a1', 'punted to the next milestone')
    const ph = (await readNode('rt')) as {
      phases: { acceptance_criteria: { status: string; reason?: string }[] }[]
    }
    expect(ph.phases[0]!.acceptance_criteria[0]).toMatchObject({
      status: 'deferred',
      reason: 'punted to the next milestone',
    })
    await ok('phase', 'status', 'rt/p1', 'done') // deferred AC does not block the floor

    // §1 — the build → done skip edge (wrap is optional); the task floor is satisfied (p1 done)
    await ok('task', 'status', 'rt', 'done')
    expect(await statusOf('rt')).toBe('done')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// requirements-3 at the epic tier: stub outcome-ACs gate child-status done, child-ac-defer
// unblocks, and a DoD item can be deferred (reason-gated) so the epic still completes.
test('e2e: epic stub outcome-ACs + DoD-item deferral gate completion — real CLI', async () => {
  const { ok, cli, out, readNode, dir } = await makeCli()
  const lastOk = () => (JSON.parse(out[out.length - 1]!) as { ok: boolean }).ok
  try {
    await ok('epic', 'create', 'ep', 'Epic')
    await ok('epic', 'child-add', 'ep', 'login', 'login flow')
    await ok('epic', 'child-add', 'ep', 'audit', 'audit log')
    await ok('epic', 'add-acceptance', 'ep', 'ships end to end') // e1
    await ok('epic', 'add-acceptance', 'ep', 'analytics dashboard') // e2 (will be deferred)

    // a stub with an open outcome-AC cannot be marked done…
    await ok('epic', 'child-ac-add', 'ep', 'login', 'auth path proven') // a1
    expect(await cli.run(['epic', 'child-status', 'ep', 'login', 'done'])).toBe(1)
    expect(lastOk()).toBe(false)
    // …evidence flips the stub-AC, then the stub can complete
    await ok('epic', 'child-ac-evidence', 'ep', 'login', 'a1', 'login/auth a1 — delivered')
    await ok('epic', 'child-status', 'ep', 'login', 'done')

    // the other stub defers its outcome-AC (reason-gated) → also completable
    await ok('epic', 'child-ac-add', 'ep', 'audit', 'retention policy')
    expect(await cli.run(['epic', 'child-ac-defer', 'ep', 'audit', 'a1'])).toBe(1) // no reason
    expect(lastOk()).toBe(false)
    await ok('epic', 'child-ac-defer', 'ep', 'audit', 'a1', 'compliance epic owns it')
    await ok('epic', 'child-status', 'ep', 'audit', 'done')

    // DoD: e1 needs delivery evidence; e2 is deferred with a reason
    await ok('epic', 'status', 'ep', 'drafted')
    await ok('epic', 'status', 'ep', 'build')
    await ok('epic', 'status', 'ep', 'wrap')
    expect(await cli.run(['epic', 'status', 'ep', 'done'])).toBe(1) // DoD items not terminal yet
    expect(lastOk()).toBe(false)
    await ok('epic', 'set-acceptance-status', 'ep', 'e1', 'done', 'login+audit — delivered')
    await ok('epic', 'set-acceptance-status', 'ep', 'e2', 'deferred', 'next quarter')
    await ok('epic', 'status', 'ep', 'done')

    const epic = (await readNode('ep')) as {
      status: string
      tasks: { status: string }[]
      acceptance: { status: string; reason?: string; evidence?: string[] }[]
    }
    expect(epic.status).toBe('done')
    expect(epic.tasks.map((t) => t.status)).toEqual(['done', 'done'])
    expect(epic.acceptance[0]).toMatchObject({
      status: 'done',
      evidence: ['login+audit — delivered'],
    })
    expect(epic.acceptance[1]).toMatchObject({ status: 'deferred', reason: 'next quarter' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
