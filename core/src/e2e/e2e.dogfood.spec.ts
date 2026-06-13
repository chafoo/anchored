import { test, expect } from 'bun:test'
import { mkdir, writeFile, rename, readFile, unlink, mkdtemp } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { createAnchored } from '../index.js'
import { createNodeOps } from '../ops/node-ops/node-ops.js'
import { createIo } from '../io/io.js'
import { phaseDescriptor } from '../schema/tiers/phase.js'

// Local fake-spawn contract (the spawn module was deleted with the headless
// engine-run path; this spec only needs the shape its harness produces/consumes).
interface SpawnInput {
  tier: string
  slug: string
  stage: string
  instructions: string
  cwd?: string
  context?: string
  executor?: string
}
interface SpawnResult {
  ok: boolean
  kind: string
  evidence?: string[]
  stdout?: string
  error?: string
}

const DEFAULT_YML = readFileSync(
  new URL('../../default-template/anchored.default.yml', import.meta.url),
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

  // fakeSpawn = the deterministic AI seam. For a phase build-step it self-writes
  // evidence via the REAL facade (the worker's cli-only self-write), exactly as a
  // spawned worker would. No real `claude -p`.
  const calls: SpawnInput[] = []
  const ref: { ops?: ReturnType<typeof createAnchored>['ops'] } = {}
  const fakeSpawn = {
    run: async (input: SpawnInput): Promise<SpawnResult> => {
      calls.push(input)
      if (input.stage === 'build' && input.tier === 'phase' && ref.ops) {
        const task = (await ref.ops.read('trivial')) as TaskRec
        const phase = task.phases.find((p) => p.slug === input.slug)
        for (const ac of phase?.acceptance_criteria ?? []) {
          if (ac.status !== 'done') {
            await ref.ops.addChildEvidence(
              'trivial',
              input.slug,
              ac.id,
              `${input.slug}.ts:1 — built`,
            )
          }
        }
      }
      return { ok: true, kind: 'fake', evidence: ['ev'] }
    },
  }

  const anchored = createAnchored({
    projectRoot: root,
    io: rawIo,
    pathFor,
    tierForSlug: () => 'task',
    readDefault: () => DEFAULT_YML,
    readUser: () => undefined,
    parseYaml: (raw) => parse(raw),
    out: () => {},
    spawn: fakeSpawn,
  })
  ref.ops = anchored.ops

  return { root, anchored, calls, realIo: createIo(rawIo), pathFor }
}

// e2e a1 + a4 — a trivial task runs plan→refine→build against a REAL substrate
// (tmp root, real atomic-writes, only fakeSpawn), ending terminal with per-phase
// evidence persisted; a read-roundtrip reads the persisted end-state back
test('a1/a4: trivial task runs end-to-end through the real substrate to a terminal state', async () => {
  const { anchored, calls } = await harness()

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

  // run the engine: build loops the phases; fakeSpawn self-writes evidence per phase
  const node = (await anchored.ops.read('trivial')) as unknown as TaskRec
  const r = await anchored.engine.run('task', node as never)
  expect(r.status).toBe('ok')

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

  // a4 — build looped each phase: fakeSpawn fired a build-step per phase
  const phaseBuilds = new Set(
    calls.filter((c) => c.stage === 'build' && c.tier === 'phase').map((c) => c.slug),
  )
  expect([...phaseBuilds].sort()).toEqual(['p1', 'p2'])
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
