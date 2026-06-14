// _v3/cli/cli.int.ts — integration: createCli wires the REAL store + template + four tier
// factories together (only the filesystem is faked, in-memory). Drives the full stack through
// the JSON envelope, the way a skill would over Bash.
import { test, expect } from 'bun:test'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { createCli } from './cli.js'

const DEFAULT = `
task:
  build:
    steps:
      - { name: implement, worker: build-implement, type: agent }
    each: phase
    retry_limit: 3
epic:
  plan:
    steps:
      - { name: scaffold, worker: epic-scaffold, type: agent }
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
    pathFor: (slug) => `/tasks/${slug}.yml`,
    rand: () => 'r',
    pid: () => 1,
    readDefault: () => DEFAULT,
    readUser: () => undefined,
    parseYaml: (r) => yamlParse(r),
    projectRoot: '/p',
    out: (l) => out.push(l),
    version: '9.9.9',
  })
  return { cli, out, fs }
}
type Env = { ok: boolean; command: string; result?: unknown; error?: { name: string } }
const last = (out: string[]): Env => JSON.parse(out[out.length - 1]!) as Env

// a1 — create → get a task through the envelope
test('create + get a task end to end', async () => {
  const { cli, out } = makeCli()
  expect(await cli.run(['task', 'create', 'my-task', 'My Task'])).toBe(0)
  expect(last(out).ok).toBe(true)
  await cli.run(['task', 'get', 'my-task'])
  expect((last(out).result as { slug: string }).slug).toBe('my-task')
})

// a2 — the build stage plan carries the template steps (worker inline) + the loop edge
test('task build returns the template-driven plan', async () => {
  const { cli, out } = makeCli()
  await cli.run(['task', 'create', 'my-task'])
  await cli.run(['task', 'build', 'my-task'])
  const plan = last(out).result as {
    steps: { worker?: string }[]
    each?: string
    node: { slug: string }
  }
  expect(plan.steps[0]!.worker).toBe('build-implement')
  expect(plan.each).toBe('phase')
  expect(plan.node.slug).toBe('my-task')
})

// a3 — an illegal transition surfaces as an error envelope (exit 1, ok:false)
test('an illegal transition is an error envelope', async () => {
  const { cli, out } = makeCli()
  await cli.run(['task', 'create', 'my-task'])
  expect(await cli.run(['task', 'status', 'my-task', 'done'])).toBe(1) // plan→done skips
  expect(last(out).ok).toBe(false)
})

// a4 — meta verbs: validate (envelope), help + version (plain text), unknown tier (error)
test('meta verbs + unknown tier', async () => {
  const { cli, out } = makeCli()
  await cli.run(['validate'])
  expect((last(out).result as { ok: boolean }).ok).toBe(true)
  await cli.run(['help'])
  expect(out[out.length - 1]).toContain('anchored — fractal')
  await cli.run(['version'])
  expect(out[out.length - 1]).toBe('anchored 9.9.9')
  expect(await cli.run(['bogus', 'x'])).toBe(1)
  expect(last(out).error!.name).toBe('UnknownTier')
})

// a5 — an epic create + plan (the epic plan steps come from the template)
test('epic create + plan flows through the wired template', async () => {
  const { cli, out } = makeCli()
  await cli.run(['epic', 'create', 'my-epic', 'Auth'])
  await cli.run(['epic', 'plan', 'my-epic'])
  const plan = last(out).result as { steps: { name: string }[] }
  expect(plan.steps[0]!.name).toBe('scaffold')
})
