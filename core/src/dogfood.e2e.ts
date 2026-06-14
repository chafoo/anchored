import { test, expect } from 'bun:test'
import { mkdir, writeFile, rename, readFile, unlink, mkdtemp } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { createAnchored } from './index.js'
import { createNodeOps } from './services/store/node-store/node-store.js'
import { createIo } from './services/store/io/io.js'
import { phase as phaseDescriptor } from './modules/phase/phase.js'

const DEFAULT_YML = readFileSync(
  new URL('../default-template/anchored.default.yml', import.meta.url),
  'utf8',
)

interface PhaseRec {
  slug: string
  status: string
  acceptance_criteria?: { id: string; status: string; evidence?: string[] }[]
}
interface TaskRec {
  slug: string
  status: string
  phases: PhaseRec[]
}

async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'anchored-dogfood-'))
  await mkdir(join(root, '.claude', 'tasks'), { recursive: true })
  const rawIo = {
    fs: {
      mkdir: (dir: string, opts?: { recursive?: boolean }) => mkdir(dir, opts),
      writeFile: (p: string, data: string) => writeFile(p, data),
      rename: (from: string, to: string) => rename(from, to),
      readFile: (p: string) => readFile(p, 'utf8'),
      unlink: (p: string) => unlink(p),
    },
    lock: { acquire: async () => async () => {} },
    rand: () => 'r',
    pid: () => 1,
  }
  const pathFor = (slug: string) => join(root, '.claude', 'tasks', `${slug}.yml`)

  const anchored = createAnchored({
    projectRoot: root,
    io: rawIo,
    pathFor,
    tierForSlug: () => 'task',
    readDefault: () => DEFAULT_YML,
    readUser: () => undefined,
    parseYaml: (raw) => parse(raw),
    out: () => {},
  })

  return { root, anchored, realIo: createIo(rawIo), pathFor }
}

// e2e a1 — a trivial task runs its forward lifecycle plan→refine→build→wrap
// against a REAL substrate (tmp root, real atomic-writes). The build worker's
// cli-only self-write (addChildEvidence per phase AC, exactly what a spawned
// worker does — no engine.run, no spawn) flips each phase AC to done; a
// read-roundtrip reads the persisted end-state back with evidence per phase.
test('a1: trivial task runs end-to-end through the real substrate to a terminal state', async () => {
  const { anchored } = await harness()

  // seed a trivial 2-phase task (status plan)
  await anchored.ops.create('trivial', {
    status: 'plan',
    phases: [
      {
        name: 'P1',
        slug: 'p1',
        status: 'pending',
        acceptance_criteria: [{ id: 'a1', text: 'prove it', status: 'pending' }],
      },
      {
        name: 'P2',
        slug: 'p2',
        status: 'pending',
        acceptance_criteria: [{ id: 'a1', text: 'prove it', status: 'pending' }],
      },
    ],
  })

  // forward lifecycle: plan → drafted → refined → build (forward-only)
  await anchored.ops.setStatus('trivial', 'drafted')
  await anchored.ops.setStatus('trivial', 'refined')
  await anchored.ops.setStatus('trivial', 'build')

  // build: the worker self-writes evidence per phase AC via the REAL facade
  // (cli-only self-write — the same path a spawned worker takes), which flips
  // each phase AC to done through the substrate invariant.
  const built = (await anchored.ops.read('trivial')) as unknown as TaskRec
  for (const phase of built.phases) {
    for (const ac of phase.acceptance_criteria ?? []) {
      await anchored.ops.addChildEvidence(
        'trivial',
        phase.slug,
        ac.id,
        `${phase.slug}.ts:1 — built`,
      )
    }
    // every AC satisfied → the phase advances to done through the substrate
    await anchored.ops.setChildStatus('trivial', phase.slug, 'done')
  }

  // build → wrap (terminal-ish): legal forward transition through the substrate
  const wrapped = (await anchored.ops.setStatus('trivial', 'wrap')) as unknown as TaskRec
  expect(wrapped.status).toBe('wrap')

  // read-roundtrip: the persisted end-state has evidence for EVERY phase
  const persisted = (await anchored.ops.read('trivial')) as unknown as TaskRec
  expect(persisted.status).toBe('wrap')
  for (const p of persisted.phases) {
    expect(p.status).toBe('done')
    expect(p.acceptance_criteria?.[0]?.status).toBe('done')
    expect(p.acceptance_criteria?.[0]?.evidence?.length).toBeGreaterThan(0)
  }
})

// e2e a2 — status transitions are forward-only: a backward jump throws at the substrate
test('a2: forward-only transitions — a backward jump throws at the writing op', async () => {
  const { anchored } = await harness()
  await anchored.ops.create('fwd', { status: 'plan' })
  // positive forward sequence
  await anchored.ops.setStatus('fwd', 'drafted')
  await anchored.ops.setStatus('fwd', 'refined')
  await anchored.ops.setStatus('fwd', 'build')
  // negative: build → plan is illegal (forward-only)
  await expect(anchored.ops.setStatus('fwd', 'plan')).rejects.toThrow(/transition/i)
})

// e2e a3 — the HARD INVARIANT end-to-end: evidence persists done; done WITHOUT
// evidence fails at the writing op (enforced in the substrate, not the test)
test('a3: invariant holds end-to-end — done needs evidence at the writing op', async () => {
  const { anchored, realIo, pathFor } = await harness()

  // WITH evidence: addChildEvidence flips the phase AC to done + persists
  await anchored.ops.create('inv', {
    status: 'build',
    phases: [
      {
        name: 'P',
        slug: 'p1',
        status: 'pending',
        acceptance_criteria: [{ id: 'a1', text: 'prove it', status: 'pending' }],
      },
    ],
  })
  await anchored.ops.addChildEvidence('inv', 'p1', 'a1', 'inv.ts:1 — proof')
  const ok = (await anchored.ops.read('inv')) as unknown as TaskRec
  expect(ok.phases[0]?.acceptance_criteria?.[0]?.status).toBe('done')
  expect(ok.phases[0]?.acceptance_criteria?.[0]?.evidence?.length).toBeGreaterThan(0)

  // WITHOUT evidence: the real writing op (node-ops.setAcStatus) refuses done
  const phaseOps = createNodeOps(phaseDescriptor, {
    io: realIo,
    render: (n) => JSON.stringify(n),
    parse: (raw) => JSON.parse(raw),
    pathFor,
  })
  const leaf = {
    slug: 'leaf',
    status: 'in-progress',
    acceptance_criteria: [{ id: 'a1', text: 'prove it', status: 'pending' }],
  }
  await expect(phaseOps.setAcStatus(leaf, 'a1', 'done')).rejects.toThrow(/evidence/i)
})
