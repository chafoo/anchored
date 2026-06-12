import { test, expect } from 'bun:test'
import { runStep } from './run-step.js'
import type { AnyNode, OpsLike, RunnerDeps, ExecOut } from '../step-runner.js'
import type { Step } from '../../schema/step.js'

const node: AnyNode = { slug: 'n', status: 'build' }

// A fake ops that records setField calls and applies them to the node.
function recordingOps(calls: { field: string; value: unknown }[]): OpsLike {
  return {
    setStatus: async (n) => n,
    nextChild: () => null,
    addQuestion: async (n) => n,
    resolveQuestion: async (n) => n,
    appendLog: async (n) => n,
    setChildStatus: async (n) => n,
    setField: async (n, field, value) => {
      calls.push({ field, value })
      return { ...n, [field]: value }
    },
  }
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

// provenance: a successful run captures `git rev-parse <ref|HEAD>` and writes the
// SHA into the declared field.
test('run-step: provenance writes the captured SHA into the field', async () => {
  const calls: { field: string; value: unknown }[] = []
  const ops = recordingOps(calls)
  const run = (cmd: string): ExecOut =>
    cmd.startsWith('git rev-parse')
      ? { code: 0, stdout: 'abc123\n', stderr: '' }
      : { code: 0, stdout: 'committed', stderr: '' }
  const step: Step = { name: 'commit', run: 'git commit', provenance: { field: 'commit_sha' } }
  const r = await runStep(step, node, deps(run, ops))
  expect(r.status).toBe('ok')
  expect(calls).toEqual([{ field: 'commit_sha', value: 'abc123' }])
  expect((r.node as AnyNode).commit_sha).toBe('abc123')
})

// provenance.ref is honored (rev-parse uses it; default would be HEAD).
test('run-step: provenance ref is passed to git rev-parse', async () => {
  const seen: string[] = []
  const ops = recordingOps([])
  const run = (cmd: string): ExecOut => {
    seen.push(cmd)
    return cmd.startsWith('git rev-parse')
      ? { code: 0, stdout: 'deadbeef\n', stderr: '' }
      : { code: 0, stdout: '', stderr: '' }
  }
  const step: Step = {
    name: 'merge',
    run: 'git merge',
    provenance: { field: 'merge_commit', ref: 'develop' },
  }
  await runStep(step, node, deps(run, ops))
  expect(seen).toContain('git rev-parse develop')
})

// no provenance ⇒ setField is never called.
test('run-step: no provenance never calls setField', async () => {
  const calls: { field: string; value: unknown }[] = []
  const ops = recordingOps(calls)
  const run = (): ExecOut => ({ code: 0, stdout: 'ok', stderr: '' })
  const step: Step = { name: 'lint', run: 'eslint .' }
  await runStep(step, node, deps(run, ops))
  expect(calls).toEqual([])
})

// a failed user command never captures (and fails the step).
test('run-step: failed command does not capture provenance', async () => {
  const calls: { field: string; value: unknown }[] = []
  const ops = recordingOps(calls)
  const run = (cmd: string): ExecOut =>
    cmd.startsWith('git rev-parse')
      ? { code: 0, stdout: 'abc\n', stderr: '' }
      : { code: 1, stdout: '', stderr: 'boom' }
  const step: Step = { name: 'commit', run: 'git commit', provenance: { field: 'commit_sha' } }
  const r = await runStep(step, node, deps(run, ops))
  expect(r.status).toBe('failed')
  expect(calls).toEqual([])
})

// a failed rev-parse does NOT fail the step (the user's command already
// succeeded) — it returns ok and notes the capture failure in evidence.
test('run-step: failed rev-parse keeps the step ok, notes it in evidence', async () => {
  const calls: { field: string; value: unknown }[] = []
  const ops = recordingOps(calls)
  const run = (cmd: string): ExecOut =>
    cmd.startsWith('git rev-parse')
      ? { code: 128, stdout: '', stderr: 'not a git repo' }
      : { code: 0, stdout: 'done', stderr: '' }
  const step: Step = { name: 'commit', run: 'git commit', provenance: { field: 'commit_sha' } }
  const r = await runStep(step, node, deps(run, ops))
  expect(r.status).toBe('ok')
  expect(calls).toEqual([])
  expect(r.evidence?.some((e) => e.includes('provenance') && e.includes('not a git repo'))).toBe(
    true,
  )
})
