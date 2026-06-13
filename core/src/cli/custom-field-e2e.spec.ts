// custom-field-e2e.spec.ts — the FULL-CLI integration guard for config-declared
// custom fields. Unit tests cover the threading piece-by-piece (custom-fields.spec,
// extensibility-matrix); this drives the whole real path:
//   config declares `task.fields.commit_sha` → createAnchored bootstraps + extends
//   the task schema → `anchored node set-field` accepts it → `anchored node read`
//   reads it back. A live dogfood run once hit `Unrecognized key: "commit_sha"` on a
//   stale build; this test locks the threading against regression.
import { test, expect } from 'bun:test'
import { parse } from 'yaml'
import { readFileSync } from 'node:fs'
import { createAnchored } from '../index.js'
import type { IoDeps } from '../io/io.js'

const DEFAULT_YML = readFileSync(
  new URL('../../default-template/anchored.default.yml', import.meta.url),
  'utf8',
)

// a small user config that declares ONE custom task field
const USER_YML = `task:
  fields:
    commit_sha: string
`

// in-memory fs map (the fake-io pattern from cli.e2e / epic-tier specs) — no real fs.
function harness() {
  const files = new Map<string, string>()
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
  const anchored = createAnchored({
    projectRoot: '/proj',
    io,
    pathFor: (slug) => `t/${slug}.yml`,
    tierForSlug: () => 'task',
    readDefault: () => DEFAULT_YML,
    readUser: () => USER_YML, // config DECLARES task.fields.commit_sha
    parseYaml: (raw) => parse(raw),
    out: (l) => out.push(l),
    now: () => '2026-06-11',
  })
  const last = () =>
    JSON.parse(out[out.length - 1]!) as {
      ok: boolean
      result?: Record<string, unknown>
      error?: Record<string, unknown>
    }
  return { cli: anchored.cli, last }
}

const SHA = 'abc1234def5678'

// a config-declared custom field round-trips through the real CLI end-to-end:
// create → set-field → read returns it.
test('config-declared task.fields.commit_sha round-trips through the real CLI', async () => {
  const { cli, last } = harness()

  // create a task node (status plan, task-shaped)
  const createCode = await cli.run(['node', 'create', 'shippable'])
  expect(createCode).toBe(0)
  expect(last().ok).toBe(true)

  // set-field the declared custom field — must be accepted (not "Unrecognized key")
  const setCode = await cli.run(['node', 'set-field', 'shippable', 'commit_sha', SHA])
  expect(setCode).toBe(0)
  expect(last().ok).toBe(true)

  // read back — the persisted node carries the custom field
  const readCode = await cli.run(['node', 'read', 'shippable'])
  expect(readCode).toBe(0)
  const env = last()
  expect(env.ok).toBe(true)
  expect((env.result as { commit_sha?: string }).commit_sha).toBe(SHA)
})

// strictness is preserved: an UNdeclared custom field on the same node is rejected.
test('an undeclared custom field is still rejected (strictness preserved)', async () => {
  const { cli, last } = harness()
  await cli.run(['node', 'create', 'shippable'])

  const code = await cli.run(['node', 'set-field', 'shippable', 'not_declared_x', 'nope'])
  expect(code).toBe(1)
  expect(last().ok).toBe(false)
})
