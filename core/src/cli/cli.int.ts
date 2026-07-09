// cli.int.ts — the real modules (cli + run + store + config) wired together IN-MEMORY:
// fake fs, open lock, real yaml. Tests the contracts BETWEEN the modules — no real fs,
// no real process.
import { describe, test, expect, beforeEach } from 'bun:test'
import { parse, stringify } from 'yaml'
import { createCli, type CliDeps } from './cli.js'
import type { Cli } from '../lib/contracts/cli.js'
import type { FileSystem } from '../lib/contracts/fs.js'
import type { Envelope } from './envelope.js'

let files: Map<string, string>
let lines: string[]
let stdin: string
let cli: Cli

function memFs(): FileSystem {
  return {
    readFile: async (p) => {
      const c = files.get(p)
      if (c === undefined) throw new Error(`ENOENT: ${p}`)
      return c
    },
    writeFile: async (p, d) => void files.set(p, d),
    rename: async (a, b) => {
      files.set(b, files.get(a)!)
      files.delete(a)
    },
    unlink: async (p) => void files.delete(p),
    mkdir: async () => undefined,
    readdir: async (dir) => {
      const names = [...files.keys()]
        .filter((p) => p.startsWith(`${dir}/`))
        .map((p) => p.slice(dir.length + 1))
      if (names.length === 0) throw new Error(`ENOENT: ${dir}`)
      return names
    },
    stat: async (p) => (files.has(p) ? `v${files.get(p)!.length}` : undefined),
  }
}

const ANCHORED_YML = stringify({
  fields: { commit: 'string' },
  defaults: { validator: { instructions: 'ground evidence' } },
  setups: { frontend: { before: { instructions: 'run lint' } } },
})

beforeEach(() => {
  files = new Map([['/repo/anchored.yml', ANCHORED_YML]])
  lines = []
  stdin = ''
  let tick = 0
  const deps: CliDeps = {
    fs: memFs(),
    lock: { acquire: async () => async () => {} },
    yaml: {
      parse: (raw, opts) => parse(raw, opts) as unknown,
      stringify: (v, o) => stringify(v, o),
    },
    projectRoot: '/repo',
    clock: () => `2026-07-08T15:${String(tick++ % 60).padStart(2, '0')}:00Z`,
    rand: () => 'x7k2',
    pid: () => 7,
    out: (line) => lines.push(line),
    readStdin: async () => stdin,
    version: '0.0.0-test',
  }
  cli = createCli(deps)
})

const call = async (argv: string[], body = ''): Promise<{ code: number; env: Envelope }> => {
  stdin = body
  const code = await cli.run(argv)
  return { code, env: JSON.parse(lines.at(-1)!) as Envelope }
}

describe('cli wiring (in-memory)', () => {
  test('anchor persists a schema-valid run file at the layout path', async () => {
    const { code, env } = await call(
      ['anchor', 'fix-navbar'],
      '{"goal": "navbar fixed", "rigor": "high", "criteria": [{"text": "wraps", "setup": "frontend", "gate": "layout"}, {"text": "desktop same", "setup": "frontend"}]}',
    )
    expect(code).toBe(0)
    expect(env.ok).toBe(true)
    const onDisk = parse(files.get('/repo/.claude/anchored/fix-navbar.yml')!) as Record<
      string,
      unknown
    >
    expect(onDisk['goal']).toBe('navbar fixed')
  })

  test('the full loop: claim → validate (packet) → evidence/fail → close', async () => {
    await call(
      ['anchor', 'r1'],
      '{"goal": "g", "criteria": [{"text": "a", "setup": "frontend", "gate": "g1"}, {"text": "b", "setup": "frontend", "gate": "g1"}]}',
    )
    await call(['claim', 'r1', 'did the thing', '--refs', 'c1,c2'])

    const validate = await call(['validate', 'r1', '--gate', 'g1'])
    const packet = validate.env.result as Record<string, unknown>
    expect((packet['criteria'] as unknown[]).length).toBe(2)
    expect(packet['snapshot']).toMatch(/^snap-/)
    expect((packet['setup'] as Record<string, unknown>)['name']).toBe('frontend')

    const snap = packet['snapshot'] as string
    await call(['evidence', 'r1', 'c1', '--snapshot', snap, '--grounded', 'bun test, exit 0'])
    const failRes = await call(['fail', 'r1', 'c2', '--snapshot', snap, '--verdict', 'overflows'])
    expect(failRes.code).toBe(0)

    const blocked = await call(['close', 'r1'])
    expect(blocked.code).toBe(2)
    expect(blocked.env.error?.kind).toBe('CloseBlocked')
    expect(blocked.env.error?.suggestions?.[0]).toContain('c2 (failed)')

    await call(['evidence', 'r1', 'c2', '--snapshot', snap, '--grounded', 'fixed, exit 0'])
    const closed = await call(['close', 'r1'])
    expect(closed.code).toBe(0)

    const status = await call(['status', 'r1'])
    expect((status.env.result as Record<string, unknown>)['closed']).toBeDefined()
  })

  test('amend via stdin body + set with field=value', async () => {
    await call(['anchor', 'r1'], '{"goal": "g", "criteria": [{"text": "a"}, {"text": "b"}]}')
    const amend = await call(
      ['amend', 'r1'],
      '{"reason": "scope shifted", "add": [{"text": "c"}], "supersede": [{"id": "c2", "by": 1}]}',
    )
    expect(amend.code).toBe(0)
    await call(['set', 'r1', 'c1', 'commit=abc123'])
    const status = await call(['status', 'r1'])
    const run = status.env.result as { criteria: Record<string, unknown>[] }
    expect(run.criteria[0]!['commit']).toBe('abc123')
    expect(run.criteria[1]).toMatchObject({ status: 'superseded', superseded_by: 'c3' })
  })

  test('status without slug lists summaries; version + usage errors', async () => {
    await call(['anchor', 'r1'], '{"goal": "g", "criteria": [{"text": "a"}]}')
    const list = await call(['status'])
    expect(list.env.result).toEqual([
      {
        slug: 'r1',
        goal: 'g',
        rigor: 'standard',
        closed: false,
        open: 1,
        failed: 0,
        done: 0,
        judged: 0,
      },
    ])
    expect((await call(['version'])).env.result).toEqual({ version: '0.0.0-test' })
    const unknown = await call(['frobnicate'])
    expect(unknown.code).toBe(2)
    expect(unknown.env.error?.kind).toBe('Usage')
    const noVerb = await call([])
    expect(noVerb.code).toBe(2)
  })

  test('missing anchored.yml still works — defaults are the behavior', async () => {
    files.delete('/repo/anchored.yml')
    const { code } = await call(['anchor', 'r1'], '{"goal": "g", "criteria": [{"text": "a"}]}')
    expect(code).toBe(0)
    const packet = (await call(['validate', 'r1'])).env.result as Record<string, unknown>
    expect(packet['setup']).toEqual({}) // no defaults declared, no setup name
  })

  test('an unknown setup in the anchor body is refused with the declared names', async () => {
    const { code, env } = await call(
      ['anchor', 'r1'],
      '{"goal": "g", "criteria": [{"text": "a", "setup": "backend"}]}',
    )
    expect(code).toBe(2)
    expect(env.error?.kind).toBe('UnknownSetup')
    expect(env.error?.suggestions?.[0]).toContain('frontend')
  })
})
