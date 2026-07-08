// cli.e2e.ts — the full 9-verb lifecycle against the REAL boundary: real tmp-dir
// filesystem, real proper-lockfile, real yaml. Mirrors bin.ts seam construction (bin is
// the executable twin of this wiring).
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { promises as nodeFs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import lockfile from 'proper-lockfile'
import { parse, stringify } from 'yaml'
import { createCli } from './cli.js'
import type { Cli } from '../lib/contracts/cli.js'
import type { FileSystem, Lock, Yaml } from '../lib/contracts/fs.js'
import type { Envelope } from './envelope.js'

let root: string
let cli: Cli
let lines: string[]
let stdin: string

beforeAll(async () => {
  root = await nodeFs.mkdtemp(join(tmpdir(), 'anchored-e2e-'))
  await nodeFs.writeFile(
    join(root, 'anchored.yml'),
    stringify({
      fields: { commit: 'string' },
      defaults: { validator: { instructions: 'ground evidence in executed commands' } },
      setups: {
        backend: { before: { instructions: 'run typecheck' } },
        frontend: { before: { instructions: 'run lint' } },
      },
    }),
    'utf8',
  )
  const fs: FileSystem = {
    readFile: (p) => nodeFs.readFile(p, 'utf8'),
    writeFile: (p, d) => nodeFs.writeFile(p, d, 'utf8'),
    rename: (a, b) => nodeFs.rename(a, b),
    unlink: (p) => nodeFs.unlink(p),
    mkdir: (dir, opts) => nodeFs.mkdir(dir, opts),
    readdir: (dir) => nodeFs.readdir(dir),
    stat: async (p) => {
      try {
        const s = await nodeFs.stat(p)
        return `${s.mtimeMs}-${s.size}`
      } catch {
        return undefined
      }
    },
  }
  const lock: Lock = {
    acquire: (path) =>
      lockfile.lock(path, { realpath: false, stale: 10_000, retries: { retries: 3 } }),
  }
  const yaml: Yaml = {
    parse: (raw, opts) => parse(raw, opts) as unknown,
    stringify: (v, opts) => stringify(v, opts),
  }
  lines = []
  cli = createCli({
    fs,
    lock,
    yaml,
    projectRoot: root,
    clock: () => new Date().toISOString(),
    rand: () => randomBytes(4).toString('hex'),
    pid: () => process.pid,
    out: (line) => lines.push(line),
    readStdin: async () => stdin,
    version: '0.1.0',
  })
})

afterAll(async () => {
  await nodeFs.rm(root, { recursive: true, force: true })
})

const call = async (argv: string[], body = ''): Promise<{ code: number; env: Envelope }> => {
  stdin = body
  const code = await cli.run(argv)
  return { code, env: JSON.parse(lines.at(-1)!) as Envelope }
}

describe('the full lifecycle on the real filesystem', () => {
  test('anchor → claim → validate → evidence/fail → amend → set → close', async () => {
    // anchor (plan verbatim through stdin YAML)
    const anchor = await call(
      ['anchor', 'avatar-upload'],
      stringify({
        goal: 'Avatar upload across all layers',
        plan: 'Accepted plan:\n1. migration\n2. endpoint\n3. UI\n',
        rigor: 'high',
        criteria: [
          { text: 'migration adds avatar_url, rollback-safe', setup: 'backend', gate: 'db' },
          { text: 'POST /avatar validates type + size', setup: 'backend', gate: 'api' },
          { text: 'upload UI shows preview', setup: 'frontend', gate: 'ui' },
        ],
      }),
    )
    expect(anchor.code).toBe(0)

    // the run file is real yaml on real disk
    const rawOnDisk = await nodeFs.readFile(
      join(root, '.claude/anchored/avatar-upload.yml'),
      'utf8',
    )
    expect((parse(rawOnDisk) as { plan: string }).plan).toContain('1. migration')

    // work + trail
    await call(['claim', 'avatar-upload', 'migration written', '--refs', 'c1'])

    // gate db: packet with the backend instruction set + minted snapshot
    const packet = (await call(['validate', 'avatar-upload', '--gate', 'db'])).env.result as Record<
      string,
      unknown
    >
    expect(
      (packet['setup'] as Record<string, Record<string, string>>)['before']!['instructions'],
    ).toBe('run typecheck')
    const snap = packet['snapshot'] as string
    expect(snap).toMatch(/^snap-/)

    // validator verbs
    await call([
      'evidence',
      'avatar-upload',
      'c1',
      '--snapshot',
      snap,
      '--grounded',
      'migration test, exit 0',
    ])
    await call([
      'fail',
      'avatar-upload',
      'c2',
      '--snapshot',
      snap,
      '--verdict',
      'size limit unchecked',
    ])

    // close refused with the friendly blocker list
    const blocked = await call(['close', 'avatar-upload'])
    expect(blocked.code).toBe(2)
    expect(blocked.env.error?.suggestions).toContain(
      'c2 (failed): POST /avatar validates type + size',
    )

    // course change: UI turns out to be out of scope → amend rejects c3
    const amend = await call(
      ['amend', 'avatar-upload'],
      stringify({ reason: 'UI ships separately', reject: ['c3'] }),
    )
    expect(amend.code).toBe(0)

    // fix + re-validate c2 (own snapshot), custom field, then close
    const packet2 = (
      await call(['validate', 'avatar-upload', '--gate', 'api', '--snapshot', 'sha-abc'])
    ).env.result as Record<string, unknown>
    expect(packet2['snapshot']).toBe('sha-abc') // --snapshot passes through verbatim
    await call([
      'evidence',
      'avatar-upload',
      'c2',
      '--snapshot',
      'sha-abc',
      '--grounded',
      'endpoint test, exit 0',
    ])
    await call(['set', 'avatar-upload', 'c2', 'commit', 'abc123'])

    const closed = await call(['close', 'avatar-upload'])
    expect(closed.code).toBe(0)

    // proof state is frozen; enrichment stays open
    expect(
      (await call(['fail', 'avatar-upload', 'c1', '--snapshot', 's', '--verdict', 'x'])).env.error
        ?.kind,
    ).toBe('RunClosed')
    expect((await call(['claim', 'avatar-upload', 'PR opened #42'])).code).toBe(0)

    // summaries
    const list = (await call(['status'])).env.result as Record<string, unknown>[]
    expect(list[0]).toMatchObject({ slug: 'avatar-upload', closed: true, done: 2 })
  }, 20_000)

  test('the invariant holds at the real boundary: raw evidence-less done never lands', async () => {
    await call(['anchor', 'tamper'], stringify({ goal: 'g', criteria: [{ text: 't' }] }))
    // simulate a buggy/malicious writer bypassing the verbs but going through the cli store path:
    const { env } = await call(['evidence', 'tamper', 'c1', '--snapshot', 's'])
    expect(env.error?.kind).toBe('SchemaViolation') // no grounded, no verdict → refused
    const raw = parse(await nodeFs.readFile(join(root, '.claude/anchored/tamper.yml'), 'utf8')) as {
      criteria: { status: string }[]
    }
    expect(raw.criteria[0]!.status).toBe('open') // nothing reached disk
  })
})
