import { test, expect } from 'bun:test'
import { runStep } from './run-step.js'
import type { AnyNode, OpsLike, RunnerDeps, ExecOut } from '../step-runner.js'
import type { Step } from '../../schema/step.js'

const node: AnyNode = { slug: 'n', status: 'build' }

// A no-op ops — run-step touches no ops at all (plain run → status only).
const noopOps: OpsLike = {
  setStatus: async (n) => n,
  nextChild: () => null,
  addQuestion: async (n) => n,
  resolveQuestion: async (n) => n,
  appendLog: async (n) => n,
  setChildStatus: async (n) => n,
}

// run-deps with a programmable run() keyed by command substring.
function deps(run: (cmd: string) => ExecOut, ops: OpsLike): RunnerDeps {
  return {
    run: async (cmd) => run(cmd),
    spawn: { run: async () => ({ ok: true, kind: 'fake' }) },
    ops,
    descriptorFor: () => ({ childTier: undefined }),
    runChildTier: async (_t, n) => ({ node: n, status: 'ok' as const }),
  }
}

// exit 0 → status ok, stdout captured as evidence.
test('run-step: exit 0 is ok and captures stdout as evidence', async () => {
  const run = (): ExecOut => ({ code: 0, stdout: 'ran', stderr: '' })
  const step: Step = { name: 'lint', run: 'eslint .' }
  const r = await runStep(step, node, deps(run, noopOps))
  expect(r.status).toBe('ok')
  expect(r.evidence).toEqual(['ran'])
})

// no stdout → ok with empty evidence.
test('run-step: exit 0 with no stdout is ok with empty evidence', async () => {
  const run = (): ExecOut => ({ code: 0, stdout: '', stderr: '' })
  const step: Step = { name: 'noop', run: 'true' }
  const r = await runStep(step, node, deps(run, noopOps))
  expect(r.status).toBe('ok')
  expect(r.evidence).toEqual([])
})

// non-zero exit → failed, stderr surfaced as the error.
test('run-step: non-zero exit is failed with stderr as error', async () => {
  const run = (): ExecOut => ({ code: 1, stdout: '', stderr: 'boom' })
  const step: Step = { name: 'commit', run: 'git commit' }
  const r = await runStep(step, node, deps(run, noopOps))
  expect(r.status).toBe('failed')
  expect(r.error).toBe('boom')
})

// non-zero exit with no stderr → failed, error falls back to the exit code.
test('run-step: non-zero exit with no stderr falls back to exit code', async () => {
  const run = (): ExecOut => ({ code: 2, stdout: '', stderr: '' })
  const step: Step = { name: 'x', run: 'false' }
  const r = await runStep(step, node, deps(run, noopOps))
  expect(r.status).toBe('failed')
  expect(r.error).toBe('exit 2')
})
