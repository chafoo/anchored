import { test, expect } from 'bun:test'
import { mkdir, writeFile, rename, readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCli } from '../index.js'

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'anchored-e2e-'))
  const tasksDir = join(root, '.claude', 'tasks')
  await mkdir(tasksDir, { recursive: true })
  const out: string[] = []
  const cli = buildCli({
    io: {
      fs: {
        mkdir: (dir, opts) => mkdir(dir, opts),
        writeFile: (p, data) => writeFile(p, data),
        rename: (from, to) => rename(from, to),
        readFile: (p) => readFile(p, 'utf8'),
      },
      lock: { acquire: async () => async () => {} },
      rand: () => 'r',
      pid: () => 1,
    },
    pathFor: (slug) => join(tasksDir, `${slug}.yml`),
    tierForSlug: () => 'phase',
    out: (l) => out.push(l),
  })
  // seed a phase node (in-progress, one unbacked AC) directly on disk
  await writeFile(
    join(tasksDir, 'my-phase.yml'),
    'name: Seam\nslug: my-phase\nstatus: in-progress\nacceptance_criteria:\n  - id: a1\n    text: prove it\n    status: pending\n',
  )
  const last = () =>
    JSON.parse(out[out.length - 1]!) as { ok: boolean; result?: { status?: string } }
  return { cli, last }
}

// a3 + a4 — real substrate: create→add-evidence→set-status done→read; invariant enforced
test('e2e against the real substrate: invariant blocks done without evidence', async () => {
  const { cli, last } = await setup()

  // a4 (fail): set-status done before evidence → ok:false, exit 1
  const code1 = await cli.run(['node', 'set-status', 'my-phase', 'done'])
  expect(code1).toBe(1)
  expect(last().ok).toBe(false)

  // add-evidence flips the AC to done with real evidence (persisted via atomic-write)
  await cli.run(['node', 'add-evidence', 'my-phase', 'a1', 'src/x.ts:1 — proof'])

  // a4 (ok) + a3: now set-status done succeeds and read returns the persisted node
  const code2 = await cli.run(['node', 'set-status', 'my-phase', 'done'])
  expect(code2).toBe(0)
  expect(last().ok).toBe(true)

  const readCode = await cli.run(['node', 'read', 'my-phase'])
  expect(readCode).toBe(0)
  expect(last().result?.status).toBe('done')
})
