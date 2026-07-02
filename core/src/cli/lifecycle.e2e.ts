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
import * as layout from './layout.js'
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
    pathFor: (slug, tier) => layout.pathFor(dir, slug, tier),
    archivePathFor: (slug, tier) => layout.archivePathFor(dir, slug, tier),
    rand: () => 'r',
    pid: () => 1,
    readDefault: () => DEFAULT,
    readUser: () => undefined,
    parseYaml: (r) => parse(r),
    projectRoot: dir,
    out: (l) => out.push(l),
    readStdin: () => '',
    version: '1.0.0',
  })

  // run a verb; throw with the error envelope if it failed (so the test fails LOUD + located).
  // --json so the helper reads the structured envelope (the default output is the readable line).
  const ok = async (...argv: string[]): Promise<unknown> => {
    const code = await cli.run([...argv, '--json'])
    const env = JSON.parse(out[out.length - 1]!) as {
      ok: boolean
      result?: unknown
      error?: unknown
    }
    if (!env.ok || code !== 0)
      throw new Error(`'${argv.join(' ')}' failed: ${JSON.stringify(env.error)}`)
    return env.result
  }
  const readNode = async (slug: string, tier: string) =>
    parse(await readFile(layout.pathFor(dir, slug, tier), 'utf8'))
  return { ok, readNode, cli, out, dir }
}

test('e2e: an epic with 2 tasks driven all the way to done — no AI, real filesystem', async () => {
  const { ok, readNode, dir } = await makeCli()
  try {
    // ── epic: create + queue two task-stubs + a definition-of-done item ──
    await ok('epic', 'create', 'my-epic', 'Auth system')
    await ok('epic', 'child', 'add', 'my-epic', 'login', 'login flow')
    await ok('epic', 'child', 'add', 'my-epic', 'logout', 'logout flow')
    await ok('epic', 'acceptance', 'add', 'my-epic', 'auth works end to end') // e1
    await ok('epic', 'status', 'my-epic', 'drafted')
    await ok('epic', 'status', 'my-epic', 'refined')
    await ok('epic', 'status', 'my-epic', 'build')

    // ── build each child task to done (the fractal recursion, done by hand) ──
    for (const t of ['login', 'logout']) {
      const slug = `my-epic/${t}`
      await ok('task', 'create', slug, t)
      await ok('task', 'phase', 'add', slug, 'setup', 'Setup')
      await ok('task', 'status', slug, 'drafted')
      await ok('task', 'status', slug, 'refined')
      await ok('task', 'status', slug, 'build')

      // work the phase: add an AC → it cannot be done without evidence → evidence flips it done
      await ok('phase', 'status', `${slug}/setup`, 'in-progress')
      await ok('phase', 'ac', 'add', `${slug}/setup`, 'the handler is validated') // a1
      await ok('phase', 'ac', 'evidence', `${slug}/setup`, 'a1', `src/${t}.ts:1 — tested`)
      // C4: a phase advances via `phase status <slug> done` (no `phase build` verb)
      await ok('phase', 'status', `${slug}/setup`, 'done')

      // the task can only reach done now that every phase is terminal
      await ok('task', 'status', slug, 'wrap')
      await ok('task', 'status', slug, 'done')

      // flip the epic's task-stub done (B1: all phases done delivers the child)
      await ok('epic', 'child', 'status', 'my-epic', t, 'done')
    }

    // ── epic finish: roll-up reads the child task files; DoD item needs delivery evidence ──
    const rollup = (await ok('epic', 'child', 'roll-up', 'my-epic')) as {
      children: { childStatus: string }[]
    }
    expect(rollup.children.map((c) => c.childStatus)).toEqual(['done', 'done'])
    await ok('epic', 'acceptance', 'status', 'my-epic', 'e1', 'done', 'login+logout — delivered')
    await ok('epic', 'status', 'my-epic', 'wrap')
    await ok('epic', 'status', 'my-epic', 'done')

    // ── assert the real files on disk reflect a fully-built epic ──
    const epic = (await readNode('my-epic', 'epic')) as {
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

    const login = (await readNode('my-epic/login', 'task')) as {
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
    await ok('task', 'phase', 'add', 'solo', 'p1', 'P1')
    await ok('phase', 'ac', 'add', 'solo/p1', 'must be backed') // a1, status pending, no evidence

    // ac done WITHOUT evidence → the schema refuses a done AC with no evidence (a guard → exit 4)
    expect(await cli.run(['phase', 'ac', 'done', 'solo/p1', 'a1', '--json'])).toBe(4)
    expect(lastOk()).toBe(false)

    // and the phase itself can't be marked done while the AC is unbacked
    await ok('phase', 'status', 'solo/p1', 'in-progress')
    expect(await cli.run(['phase', 'status', 'solo/p1', 'done', '--json'])).toBe(4)
    expect(lastOk()).toBe(false)

    // evidence flips it — and only THEN does done go through
    await ok('phase', 'ac', 'evidence', 'solo/p1', 'a1', 'src/solo.ts:9 — proof')
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
  const statusOf = async (slug: string, tier: string) =>
    ((await readNode(slug, tier)) as { status: string }).status
  try {
    await ok('task', 'create', 'rt', 'R')
    await ok('task', 'phase', 'add', 'rt', 'p1', 'P1')

    // order cannot jump: plan → build is illegal (drafted is not optional) — a guard → exit 4
    expect(await cli.run(['task', 'status', 'rt', 'build', '--json'])).toBe(4)
    expect(lastOk()).toBe(false)

    await ok('task', 'status', 'rt', 'drafted')

    // §5 — an open question blocks the advance to build (with a listing message)
    await ok('task', 'question', 'add', 'rt', 'which storage?', 'high')
    expect(await cli.run(['task', 'status', 'rt', 'build', '--json'])).toBe(4)
    expect(lastOk()).toBe(false)
    const blocked = JSON.parse(out[out.length - 1]!) as { error?: { name?: string } }
    expect(blocked.error?.name).toBe('QuestionsOpen')

    // resolve it → the skip-refine edge drafted → build now goes through
    await ok('task', 'question', 'resolve', 'rt', 'q1', 'localStorage', 'user')
    await ok('task', 'status', 'rt', 'build')
    expect(await statusOf('rt', 'task')).toBe('build')

    // §3 — a deferred AC is reason-gated and then terminal (the phase finishes without evidence on it)
    await ok('phase', 'status', 'rt/p1', 'in-progress')
    await ok('phase', 'ac', 'add', 'rt/p1', 'nice-to-have polish') // a1
    expect(await cli.run(['phase', 'ac', 'defer', 'rt/p1', 'a1', '--json'])).toBe(4) // no reason → guard
    expect(lastOk()).toBe(false)
    const noReason = JSON.parse(out[out.length - 1]!) as { error?: { name?: string } }
    expect(noReason.error?.name).toBe('AcNoReason') // clean message, not a raw ZodError
    await ok('phase', 'ac', 'defer', 'rt/p1', 'a1', 'punted to the next milestone')
    const ph = (await readNode('rt', 'task')) as {
      phases: { acceptance_criteria: { status: string; reason?: string }[] }[]
    }
    expect(ph.phases[0]!.acceptance_criteria[0]).toMatchObject({
      status: 'deferred',
      reason: 'punted to the next milestone',
    })
    await ok('phase', 'status', 'rt/p1', 'done') // deferred AC does not block the floor

    // §1 — the build → done skip edge (wrap is optional); the task floor is satisfied (p1 done)
    await ok('task', 'status', 'rt', 'done')
    expect(await statusOf('rt', 'task')).toBe('done')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// requirements-3 at the epic tier, post-B1: stub outcome-ACs DOCUMENT but no longer gate
// `child status done` (all-phases-done delivers the child); the DoD layer is where outcomes are
// verified — a DoD item needs delivery evidence, and a DoD item can be deferred (reason-gated)
// so the epic still completes.
test('e2e: B1 stub delivery + DoD-item evidence/deferral gate epic completion — real CLI', async () => {
  const { ok, cli, out, readNode, dir } = await makeCli()
  const lastOk = () => (JSON.parse(out[out.length - 1]!) as { ok: boolean }).ok
  try {
    await ok('epic', 'create', 'ep', 'Epic')
    await ok('epic', 'child', 'add', 'ep', 'login', 'login flow')
    await ok('epic', 'child', 'add', 'ep', 'audit', 'audit log')
    await ok('epic', 'acceptance', 'add', 'ep', 'ships end to end') // e1
    await ok('epic', 'acceptance', 'add', 'ep', 'analytics dashboard') // e2 (will be deferred)

    // B1: a stub with an open outcome-AC CAN be marked done (all-phases-done delivers the child).
    await ok('epic', 'child', 'ac', 'add', 'ep', 'login', 'auth path proven') // a1
    await ok('epic', 'child', 'status', 'ep', 'login', 'done')
    // the outcome AC still records evidence (verified at roll-up/wrap, not at the build floor)
    await ok('epic', 'child', 'ac', 'evidence', 'ep', 'login', 'a1', 'login/auth a1 — delivered')

    // the other stub records + defers its outcome AC (reason-gated) and is also delivered
    await ok('epic', 'child', 'ac', 'add', 'ep', 'audit', 'retention policy')
    expect(await cli.run(['epic', 'child', 'ac', 'defer', 'ep', 'audit', 'a1', '--json'])).toBe(4) // no reason → guard
    expect(lastOk()).toBe(false)
    await ok('epic', 'child', 'ac', 'defer', 'ep', 'audit', 'a1', 'compliance epic owns it')
    await ok('epic', 'child', 'status', 'ep', 'audit', 'done')

    // DoD: e1 needs delivery evidence; e2 is deferred with a reason
    await ok('epic', 'status', 'ep', 'drafted')
    await ok('epic', 'status', 'ep', 'build')
    await ok('epic', 'status', 'ep', 'wrap')
    expect(await cli.run(['epic', 'status', 'ep', 'done', '--json'])).toBe(4) // DoD not terminal → guard
    expect(lastOk()).toBe(false)
    await ok('epic', 'acceptance', 'status', 'ep', 'e1', 'done', 'login+audit — delivered')
    await ok('epic', 'acceptance', 'status', 'ep', 'e2', 'deferred', 'next quarter')
    await ok('epic', 'status', 'ep', 'done')

    const epic = (await readNode('ep', 'epic')) as {
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

// The universal collection read-vocabulary (`list` + `get`) driven over the REAL CLI on the real
// filesystem — proving the full strip Bash → dispatch → real file → output actually works for the
// new ops, BOTH as a JSON envelope AND as the default parse-free agent-line (the whole point of the
// read side: the orchestrator reads state without piping through a JSON parser).
test('e2e: list/get across every collection — JSON envelope AND default agent-line', async () => {
  const { ok, cli, out, dir } = await makeCli()
  try {
    await ok('epic', 'create', 'rv', 'Read vocabulary')
    await ok('epic', 'child', 'add', 'rv', 'login', 'login flow')
    await ok('epic', 'child', 'add', 'rv', 'logout', 'logout flow')
    await ok('epic', 'acceptance', 'add', 'rv', 'auth works end to end')
    await ok('epic', 'question', 'add', 'rv', 'monolith or service?', 'high')
    await ok('epic', 'concern', 'add', 'rv', 'rate limiting unaddressed', 'medium')
    await ok('epic', 'child', 'ac', 'add', 'rv', 'login', 'auth handler tested')

    // ── the JSON-envelope side: every collection answers list/get uniformly ──
    expect(
      ((await ok('epic', 'child', 'list', 'rv')) as { slug: string }[]).map((c) => c.slug),
    ).toEqual(['login', 'logout'])
    expect(((await ok('epic', 'child', 'get', 'rv', 'login')) as { slug: string }).slug).toBe(
      'login',
    )
    expect((await ok('epic', 'acceptance', 'list', 'rv')) as unknown[]).toHaveLength(1)
    expect(((await ok('epic', 'acceptance', 'get', 'rv', 'e1')) as { id: string }).id).toBe('e1')
    expect(((await ok('epic', 'question', 'list', 'rv')) as { id: string }[])[0]!.id).toBe('q1')
    expect((await ok('epic', 'concern', 'list', 'rv')) as unknown[]).toHaveLength(1)
    expect((await ok('epic', 'log', 'list', 'rv')) as unknown[]).toBeInstanceOf(Array)
    // the nested child-ac sub-collection too
    expect(
      ((await ok('epic', 'child', 'ac', 'list', 'rv', 'login')) as { id: string }[])[0]!.id,
    ).toBe('a1')
    expect(
      ((await ok('epic', 'child', 'ac', 'get', 'rv', 'login', 'a1')) as { text: string }).text,
    ).toBe('auth handler tested')

    // ── the default agent-line side (NO --json): one dense, parse-free line per item ──
    expect(await cli.run(['epic', 'question', 'list', 'rv'])).toBe(0)
    const qLine = out[out.length - 1]!
    expect(qLine).toContain('q1 · status: open · priority: high · monolith or service?')
    expect(qLine).not.toContain('{') // no JSON leaked into the readable line

    // a single get renders as one generic item line (not a node summary, not JSON)
    await cli.run(['epic', 'child', 'get', 'rv', 'login'])
    const cLine = out[out.length - 1]!
    expect(cLine).toContain('login')
    expect(cLine).not.toContain('{')

    // an unknown id is a located error envelope over the real CLI (non-zero exit)
    expect(await cli.run(['epic', 'child', 'get', 'rv', 'ghost', '--json'])).not.toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// The FULL walk against the REAL SHIPPED default template (not the minimal test template) —
// this is the only e2e that drives the actual anchored.default.yml, so the step-enforcement
// receipts (StepsUnreceipted gates on every stage-closing transition) and the served
// `each_steps` leaf pipeline are proven end to end on the real filesystem.
test('e2e: step receipts gate every stage close — real shipped template', async () => {
  const { readFileSync } = await import('node:fs')
  const shipped = readFileSync(
    new URL('../../default-template/anchored.default.yml', import.meta.url),
    'utf8',
  )
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
    pathFor: (slug, tier) => layout.pathFor(dir, slug, tier),
    archivePathFor: (slug, tier) => layout.archivePathFor(dir, slug, tier),
    rand: () => 'r',
    pid: () => 1,
    readDefault: () => shipped,
    readUser: () => undefined,
    parseYaml: (r) => parse(r),
    projectRoot: dir,
    out: (l) => out.push(l),
    readStdin: () => '',
    version: '1.0.0',
  })
  const ok = async (...argv: string[]): Promise<unknown> => {
    const code = await cli.run([...argv, '--json'])
    const env = JSON.parse(out[out.length - 1]!) as {
      ok: boolean
      result?: unknown
      error?: unknown
    }
    if (!env.ok || code !== 0)
      throw new Error(`'${argv.join(' ')}' failed: ${JSON.stringify(env.error)}`)
    return env.result
  }
  const rejected = async (name: string, ...argv: string[]) => {
    const code = await cli.run([...argv, '--json'])
    const env = JSON.parse(out[out.length - 1]!) as { ok: boolean; error?: { name?: string } }
    expect(code).not.toBe(0)
    expect(env.ok).toBe(false)
    expect(env.error?.name).toBe(name)
  }
  try {
    await ok('task', 'create', 'rcpt', 'Receipts')

    // plan closes only with a receipt per shipped plan step (discover, rules-scan, decompose)
    await rejected('StepsUnreceipted', 'task', 'status', 'rcpt', 'drafted')
    await ok('task', 'step', 'done', 'rcpt', 'plan', 'discover', 'scanned')
    await ok('task', 'step', 'done', 'rcpt', 'plan', 'rules-scan', '1 rule')
    await ok('task', 'step', 'done', 'rcpt', 'plan', 'decompose', '1 phase')
    await ok('task', 'status', 'rcpt', 'drafted')

    // refine: the shipped gates are plan-check + walk; a skip is reason-gated by the schema
    await rejected('StepsUnreceipted', 'task', 'status', 'rcpt', 'refined')
    await ok('task', 'step', 'done', 'rcpt', 'refine', 'plan-check', 'no drift')
    await rejected('ZodError', 'task', 'step', 'skip', 'rcpt', 'refine', 'walk')
    await ok('task', 'step', 'skip', 'rcpt', 'refine', 'walk', 'no open questions')
    await ok('task', 'status', 'rcpt', 'refined')
    await ok('task', 'status', 'rcpt', 'build')

    // the build plan serves the leaf pipeline as each_steps — the orchestrator's only source
    const plan = (await ok('task', 'build', 'rcpt')) as {
      each: string
      each_steps: { name: string }[]
    }
    expect(plan.each).toBe('phase')
    expect(plan.each_steps.map((s) => s.name)).toEqual(['implement', 'task-validate'])

    // the leaf pipeline gates `phase status done` — ACs terminal is NOT enough
    await ok('task', 'phase', 'add', 'rcpt', 'p1', 'P1')
    await ok('phase', 'status', 'rcpt/p1', 'in-progress')
    await ok('phase', 'ac', 'add', 'rcpt/p1', 'works')
    await ok('phase', 'ac', 'evidence', 'rcpt/p1', 'a1', 'src/x.ts — proven')
    await rejected('StepsUnreceipted', 'phase', 'status', 'rcpt/p1', 'done')
    await ok('phase', 'step', 'done', 'rcpt/p1', 'build', 'implement', 'code written')
    await ok('phase', 'step', 'done', 'rcpt/p1', 'build', 'task-validate', 'a1 evidenced')
    await ok('phase', 'status', 'rcpt/p1', 'done')

    // wrap closes only with review + summarize receipted
    await ok('task', 'status', 'rcpt', 'wrap')
    await rejected('StepsUnreceipted', 'task', 'status', 'rcpt', 'done')
    await ok('task', 'step', 'done', 'rcpt', 'wrap', 'review', 'clean')
    await ok('task', 'step', 'done', 'rcpt', 'wrap', 'summarize', '1 phase built')
    await ok('task', 'status', 'rcpt', 'done')

    // epic: plan (discover, scaffold) + wrap (roll-up) gate the same way
    await ok('epic', 'create', 'er', 'E')
    await ok('epic', 'child', 'add', 'er', 'only', 'the one stub', '')
    await rejected('StepsUnreceipted', 'epic', 'status', 'er', 'drafted')
    await ok('epic', 'step', 'done', 'er', 'plan', 'discover', 'scanned')
    await ok('epic', 'step', 'skip', 'er', 'plan', 'scaffold', 'stub added by hand')
    await ok('epic', 'status', 'er', 'drafted')
    await ok('epic', 'status', 'er', 'build')
    await ok('epic', 'child', 'status', 'er', 'only', 'done')
    await ok('epic', 'status', 'er', 'wrap')
    await rejected('StepsUnreceipted', 'epic', 'status', 'er', 'done')
    await ok('epic', 'step', 'done', 'er', 'wrap', 'roll-up', 'child delivered, no DoD items')
    await ok('epic', 'status', 'er', 'done')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
