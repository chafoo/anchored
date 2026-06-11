import { test, expect } from 'bun:test'
import { createSpawn, createFakeSpawn, type ExecResult, type SpawnInput } from './spawn.js'

const input: SpawnInput = { tier: 'phase', slug: 'p', stage: 'build', instructions: 'do the thing' }

function fakeExec(result: Partial<ExecResult> = {}) {
  const calls: { argv: string[]; cwd?: string }[] = []
  const exec = async (argv: string[], opts: { cwd?: string }): Promise<ExecResult> => {
    calls.push({ argv, cwd: opts.cwd })
    return { code: 0, stdout: '{"ok":true}', stderr: '', ...result }
  }
  return { calls, exec }
}

// contract a2 — fake spawn injectable, scripted results, records calls
test('createFakeSpawn returns scripted results and records calls', async () => {
  const fake = createFakeSpawn([{ ok: true, kind: 'fake', evidence: ['e'] }])
  const r = await fake.spawn.run(input)
  expect(r.evidence).toEqual(['e'])
  expect(fake.calls[0]?.instructions).toBe('do the thing')
})

// contract a3 — unknown mode → ok:false config-error
test('unknown spawn mode yields ok:false config-error', async () => {
  const r = await createSpawn({ spawn: { mode: 'bogus' } }, {}).run(input)
  expect(r.ok).toBe(false)
  expect(r.kind).toBe('config-error')
})

// headless a1 — argv build (-p, instructions, model) + cwd
test('headless builds claude -p argv and passes cwd', async () => {
  const fe = fakeExec()
  const r = await createSpawn(
    { spawn: { mode: 'headless', model: 'sonnet' } },
    { exec: fe.exec },
  ).run({ ...input, cwd: '/proj', instructions: 'do X' })
  expect(r.ok).toBe(true)
  expect(fe.calls[0]?.argv).toContain('-p')
  expect(fe.calls[0]?.argv).toContain('do X')
  expect(fe.calls[0]?.argv).toContain('--model')
  expect(fe.calls[0]?.cwd).toBe('/proj')
})

// headless a2 — one exec per task (phases in-process)
test('headless = one exec per task (phases in-process)', async () => {
  const fe = fakeExec()
  await createSpawn({ spawn: { mode: 'headless' } }, { exec: fe.exec }).run({
    ...input,
    instructions: 'phase1 then phase2 then phase3',
  })
  expect(fe.calls.length).toBe(1)
})

// headless a3 — non-zero exit / empty stdout → ok:false
test('headless non-zero exit / empty stdout yields ok:false', async () => {
  const r = await createSpawn(
    { spawn: { mode: 'headless' } },
    { exec: fakeExec({ code: 1, stderr: 'boom' }).exec },
  ).run(input)
  expect(r.ok).toBe(false)
  expect(r.kind).toBe('exec-failed')
  const r2 = await createSpawn(
    { spawn: { mode: 'headless' } },
    { exec: fakeExec({ stdout: '   ' }).exec },
  ).run(input)
  expect(r2.kind).toBe('empty-output')
})

// headless a4 — real smoke (opt-in; skipped to avoid recursive claude -p in CI)
test.skip('headless real smoke — opt-in; skipped: avoids recursive claude -p / cost in CI', () => {
  // Run manually with a real node:child_process exec wrapper + ANCHORED_SPAWN_SMOKE=1.
})

// subagent a1 — triggers agent dep, maps to the shared result shape
test('subagent triggers agent dep and maps to the shared result shape', async () => {
  const agentCalls: unknown[] = []
  const agent = async (req: { instructions: string; context?: string; executor?: string }) => {
    agentCalls.push(req)
    return { ok: true, evidence: ['agent-ev'], output: 'done' }
  }
  const r = await createSpawn({ spawn: { mode: 'subagent' } }, { agent }).run({
    ...input,
    context: 'ctx',
  })
  expect(r.ok).toBe(true)
  expect(r.kind).toBe('subagent')
  expect(r.evidence).toEqual(['agent-ev'])
  expect(agentCalls[0]).toMatchObject({ instructions: 'do the thing', context: 'ctx' })
})

// subagent a2/a4 — same shape both modes; workflow executor passed through
test('both modes share result shape; subagent passes executor through (workflow hook)', async () => {
  const headlessR = await createSpawn(
    { spawn: { mode: 'headless' } },
    { exec: fakeExec().exec },
  ).run(input)
  let passedExecutor: string | undefined
  const agent = async (req: { instructions: string; executor?: string }) => {
    passedExecutor = req.executor
    return { ok: true, output: 'x' }
  }
  const subagentR = await createSpawn({ spawn: { mode: 'subagent' } }, { agent }).run({
    ...input,
    executor: 'workflow',
  })
  expect(typeof headlessR.ok).toBe('boolean')
  expect(typeof subagentR.ok).toBe('boolean')
  expect(typeof headlessR.kind).toBe('string')
  expect(typeof subagentR.kind).toBe('string')
  expect(passedExecutor).toBe('workflow')
})

// subagent a3 / mode-select a1 — mode-blind switch; env > cfg > default(headless)
test('mode resolution: env > cfg > default(headless); run(input) unchanged', async () => {
  const fe = fakeExec()
  let agentHit = false
  const agent = async () => {
    agentHit = true
    return { ok: true }
  }
  await createSpawn({}, { exec: fe.exec }).run(input) // default → headless
  expect(fe.calls.length).toBe(1)
  await createSpawn({ spawn: { mode: 'subagent' } }, { agent }).run(input) // cfg → subagent
  expect(agentHit).toBe(true)
  const env = (n: string) => (n === 'ANCHORED_SPAWN_MODE' ? 'headless' : undefined)
  await createSpawn({ spawn: { mode: 'subagent' } }, { exec: fe.exec, env }).run(input) // env beats cfg
  expect(fe.calls.length).toBe(2)
})

// subagent a5 — real subagent smoke (skipped: CC agent() only in a live session)
test.skip('subagent real smoke — skipped: CC agent() exists only in a live session, not bun test', () => {
  // The real agent dep is unavailable in standalone bun test; run as an in-session smoke.
})
