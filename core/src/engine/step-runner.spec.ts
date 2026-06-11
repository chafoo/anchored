import { test, expect } from 'bun:test'
import { createStepRunner, type RunnerDeps, type AnyNode, type OpsLike } from './step-runner.js'

const noopOps: OpsLike = {
  setStatus: async (n) => n,
  nextChild: () => null,
  addQuestion: async (n) => n,
  resolveQuestion: async (n) => n,
  appendLog: async (n) => n,
  setChildStatus: async (n) => n,
}

function makeDeps(over: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    run: async () => ({ code: 0, stdout: 'ran', stderr: '' }),
    spawn: { run: async () => ({ ok: true, kind: 'fake', evidence: ['ev'] }) },
    ops: noopOps,
    descriptorFor: () => ({ childTier: 'phase' }),
    runChildTier: async (_t: string, n: AnyNode) => ({ node: n, status: 'ok' as const }),
    ...over,
  }
}

const node: AnyNode = { slug: 'p', status: 'pending' }
const ctx = { tier: 'phase', stage: 'build' }

// a2 — step.run → run-step (bash), spawn NOT called
test('step.run dispatches to bash run, not spawn', async () => {
  let ranCmd = ''
  let spawnCalled = false
  const sr = createStepRunner(
    {},
    makeDeps({
      run: async (cmd) => {
        ranCmd = cmd
        return { code: 0, stdout: 'x', stderr: '' }
      },
      spawn: {
        run: async () => {
          spawnCalled = true
          return { ok: true, kind: 'x' }
        },
      },
    }),
  )
  const r = await sr.run({ name: 'lint', run: 'eslint .' }, node, ctx)
  expect(ranCmd).toBe('eslint .')
  expect(spawnCalled).toBe(false)
  expect(r.status).toBe('ok')
})

// a3 — step.use → worker-step (spawn), returns { node, status, evidence }
test('step.use dispatches to spawn worker; returns node/status/evidence', async () => {
  let instr = ''
  const sr = createStepRunner(
    {},
    makeDeps({
      spawn: {
        run: async (i) => {
          instr = i.instructions
          return { ok: true, kind: 'x', evidence: ['proof'] }
        },
      },
    }),
  )
  const r = await sr.run(
    { name: 'implement', use: 'build-implement', instructions: 'do' },
    node,
    ctx,
  )
  expect(instr).toBe('do')
  expect(r.status).toBe('ok')
  expect(r.evidence).toEqual(['proof'])
})

// a5 — step.each → loop-step (defined path, not a silent no-op)
test('step.each dispatches to loop-step (defined, not silent)', async () => {
  const sr = createStepRunner({ build: {} }, makeDeps())
  const r = await sr.run({ name: 'loop', each: 'phase' }, node, ctx) // no children → terminates ok
  expect(r.status).toBe('ok')
})
