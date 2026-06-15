// _v3/cli/cli.int.ts — integration: createCli wires the REAL store + template + four tier
// factories together (only the filesystem is faked, in-memory). Drives the full stack through
// the JSON envelope, the way a skill would over Bash.
import { test, expect } from 'bun:test'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { createCli } from './cli.js'
import * as layout from './layout.js'

const DEFAULT = `
task:
  build:
    steps:
      - { name: implement, use: { type: agent, name: build-implement } }
    each: phase
    retry_limit: 3
epic:
  plan:
    steps:
      - { name: scaffold, use: { type: agent, name: epic-scaffold } }
`

function inMemoryFs() {
  const files = new Map<string, string>()
  const ver = new Map<string, number>()
  return {
    files,
    readFile: async (p: string) => {
      const c = files.get(p)
      if (c === undefined) throw new Error('ENOENT')
      return c
    },
    writeFile: async (p: string, d: string) => {
      files.set(p, d)
      ver.set(p, (ver.get(p) ?? 0) + 1)
    },
    rename: async (a: string, b: string) => {
      files.set(b, files.get(a)!)
      files.delete(a)
    },
    unlink: async (p: string) => void files.delete(p),
    mkdir: async () => undefined,
    stat: async (p: string) => (files.has(p) ? String(ver.get(p) ?? 0) : undefined),
  }
}

function makeCli() {
  const fs = inMemoryFs()
  const out: string[] = []
  const cli = createCli({
    fs,
    lock: { acquire: async () => async () => {} },
    yaml: { parse: (r, o) => yamlParse(r, o), stringify: (v, o) => yamlStringify(v, o) },
    pathFor: (slug, tier) => layout.pathFor('', slug, tier),
    archivePathFor: (slug, tier) => layout.archivePathFor('', slug, tier),
    rand: () => 'r',
    pid: () => 1,
    readDefault: () => DEFAULT,
    readUser: () => undefined,
    parseYaml: (r) => yamlParse(r),
    projectRoot: '/p',
    out: (l) => out.push(l),
    readStdin: () => '',
    version: '9.9.9',
  })
  return { cli, out, fs }
}
type Env = { ok: boolean; command: string; result?: unknown; error?: { name: string } }
const last = (out: string[]): Env => JSON.parse(out[out.length - 1]!) as Env

// a1 — create → get a task through the envelope (--json for the structured shape)
test('create + get a task end to end', async () => {
  const { cli, out } = makeCli()
  expect(await cli.run(['task', 'create', 'my-task', 'My Task', '--json'])).toBe(0)
  expect(last(out).ok).toBe(true)
  await cli.run(['task', 'get', 'my-task', '--json'])
  expect((last(out).result as { slug: string }).slug).toBe('my-task')
})

// a2 — the build stage plan carries the template steps (worker inline via `use`) + the loop edge
test('task build returns the template-driven plan', async () => {
  const { cli, out } = makeCli()
  await cli.run(['task', 'create', 'my-task'])
  await cli.run(['task', 'build', 'my-task', '--json'])
  const plan = last(out).result as {
    steps: { use?: { name?: string } }[]
    each?: string
    node: { slug: string }
  }
  expect(plan.steps[0]!.use?.name).toBe('build-implement')
  expect(plan.each).toBe('phase')
  expect(plan.node.slug).toBe('my-task')
})

// a3 — an illegal transition surfaces as an error envelope (exit 1, ok:false)
test('an illegal transition is an error envelope', async () => {
  const { cli, out } = makeCli()
  await cli.run(['task', 'create', 'my-task'])
  // plan→done skips (illegal): a guard refusal → exit 4 (F3), and the envelope reads not-ok.
  expect(await cli.run(['task', 'status', 'my-task', 'done', '--json'])).toBe(4)
  expect(last(out).ok).toBe(false)
})

// a4 — meta verbs: validate (envelope), help + version (plain text), unknown tier (error)
test('meta verbs + unknown tier', async () => {
  const { cli, out } = makeCli()
  await cli.run(['validate', '--json'])
  expect((last(out).result as { ok: boolean }).ok).toBe(true)
  await cli.run(['help'])
  expect(out[out.length - 1]).toContain('anchored — fractal')
  await cli.run(['version'])
  expect(out[out.length - 1]).toBe('anchored 9.9.9')
  // an unknown tier is a usage error → exit 2 (F3)
  expect(await cli.run(['bogus', 'x', '--json'])).toBe(2)
  expect(last(out).error!.name).toBe('UnknownTier')
})

// a5 — an epic create + plan (the epic plan steps come from the template)
test('epic create + plan flows through the wired template', async () => {
  const { cli, out } = makeCli()
  await cli.run(['epic', 'create', 'my-epic', 'Auth'])
  await cli.run(['epic', 'plan', 'my-epic', '--json'])
  const plan = last(out).result as { steps: { name: string }[] }
  expect(plan.steps[0]!.name).toBe('scaffold')
})

// a6 — F1: the DEFAULT output is one dense readable line (no JSON blob) carrying state + next
test('default output is one readable line with a next: hint (F1/F2)', async () => {
  const { cli, out } = makeCli()
  await cli.run(['task', 'create', 'my-task'])
  await cli.run(['task', 'status', 'my-task', 'drafted'])
  const line = out[out.length - 1]!
  expect(line).not.toContain('{') // not a JSON blob
  expect(line).toContain('task status · slug: my-task · status: drafted')
  expect(line).toContain('next: status → refined | build')
})

// a7 — G2: a `-` positional reads one body value from the injected readStdin seam
test('a `-` positional reads the body from stdin (G2)', async () => {
  const fs = inMemoryFs()
  const out: string[] = []
  const cli = createCli({
    fs,
    lock: { acquire: async () => async () => {} },
    yaml: { parse: (r, o) => yamlParse(r, o), stringify: (v, o) => yamlStringify(v, o) },
    pathFor: (slug, tier) => layout.pathFor('', slug, tier),
    archivePathFor: (slug, tier) => layout.archivePathFor('', slug, tier),
    rand: () => 'r',
    pid: () => 1,
    readDefault: () => DEFAULT,
    readUser: () => undefined,
    parseYaml: (r) => yamlParse(r),
    projectRoot: '/p',
    out: (l) => out.push(l),
    readStdin: () => 'src/login.ts:1 — verified via stdin',
    version: '9.9.9',
  })
  await cli.run(['task', 'create', 'my-task'])
  await cli.run(['task', 'phase', 'add', 'my-task', 'setup'])
  await cli.run(['task', 'status', 'my-task', 'drafted'])
  await cli.run(['task', 'status', 'my-task', 'build'])
  await cli.run(['phase', 'status', 'my-task/setup', 'in-progress'])
  await cli.run(['phase', 'ac', 'add', 'my-task/setup', 'handler validated'])
  // the `-` is replaced by the stdin string → the AC is evidenced from stdin
  await cli.run(['phase', 'ac', 'evidence', 'my-task/setup', 'a1', '-', '--json'])
  // the phase verbs write the whole TASK file → the AC sits under phases[0].acceptance_criteria
  const env = JSON.parse(out[out.length - 1]!) as {
    ok: boolean
    result: {
      phases: { acceptance_criteria: { id: string; status: string; evidence?: string[] }[] }[]
    }
  }
  expect(env.ok).toBe(true)
  const ac = env.result.phases[0]!.acceptance_criteria[0]!
  expect(ac.status).toBe('done')
  expect(ac.evidence).toEqual(['src/login.ts:1 — verified via stdin'])
})

// a8 — F4: setting a status to its current value is ok, not an error (idempotent)
test('a same-state status set is idempotent ok (F4)', async () => {
  const { cli, out } = makeCli()
  await cli.run(['task', 'create', 'my-task'])
  await cli.run(['task', 'status', 'my-task', 'drafted'])
  // drafted → drafted again: no error, exit 0
  expect(await cli.run(['task', 'status', 'my-task', 'drafted', '--json'])).toBe(0)
  expect(last(out).ok).toBe(true)
})
