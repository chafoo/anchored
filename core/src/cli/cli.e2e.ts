// _v3/cli/cli.e2e.ts — end-to-end: the REAL filesystem (a temp dir) + the real yaml lib,
// wired into createCli exactly as bin.ts does. Drives the full lifecycle through the JSON
// envelope and asserts the actual files on disk round-trip. The only test that hits real I/O.
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
    steps:
      - { name: implement, use: { type: agent, name: build-implement } }
    each: phase
    retry_limit: 3
`

async function makeCli() {
  const dir = await mkdtemp(join(tmpdir(), 'anchored-v3-'))
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
    version: '1.0.0',
  })
  return { cli, out, dir }
}
type Env = { ok: boolean; result?: { title?: string; status?: string } }
const last = (out: string[]): Env => JSON.parse(out[out.length - 1]!) as Env

test('e2e: create → get → status persists to the real filesystem; archive moves the file', async () => {
  const { cli, out, dir } = await makeCli()
  try {
    // a standalone task lands under anchored/tasks/<slug>.yml
    const taskPath = layout.pathFor(dir, 'my-task', 'task')
    const archivedPath = layout.archivePathFor(dir, 'my-task', 'task').to
    expect(await cli.run(['task', 'create', 'my-task', 'My Task'])).toBe(0)
    expect(await readFile(taskPath, 'utf8')).toContain('slug: my-task')

    // read it back THROUGH the cli (real yaml parse + schema validate)
    await cli.run(['task', 'get', 'my-task'])
    expect(last(out).result!.title).toBe('My Task')

    // a real status transition persists to disk
    await cli.run(['task', 'status', 'my-task', 'drafted'])
    expect(await readFile(taskPath, 'utf8')).toContain('status: drafted')

    // archive moves the file into _archive/tasks/
    await cli.run(['task', 'archive', 'my-task'])
    expect(await readFile(archivedPath, 'utf8')).toContain('slug: my-task')
    await expect(readFile(taskPath, 'utf8')).rejects.toThrow()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
