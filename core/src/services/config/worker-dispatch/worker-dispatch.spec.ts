import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { createWorkerDispatch } from './worker-dispatch.js'
import { createResolveSteps } from '../resolve-steps/resolve-steps.js'
import { STAGES } from '../stages.js'

const NAMES = [
  'implement',
  'task-validate',
  'code-validate',
  'discover',
  'rules-scan',
  'decompose',
  'plan-check',
  'rules-check',
  'walk',
  'review',
  'summarize',
  'scaffold',
  'roll-up',
]

// a1 — every default step name resolves to a non-empty worker ref
test('resolveWorker returns a non-empty ref for all 13 default step names', () => {
  const d = createWorkerDispatch()
  for (const n of NAMES) {
    const w = d.resolveWorker(n)
    expect(w).toBeDefined()
    expect(w?.ref.length ?? 0).toBeGreaterThan(0)
  }
})

// a2 — refs match the agent roster filenames; walk is skill-routing (not an agent)
test('worker refs match the agent roster; walk is skill-routing', () => {
  const d = createWorkerDispatch()
  expect(d.resolveWorker('implement')).toEqual({ type: 'agent', ref: 'build-implement' })
  expect(d.resolveWorker('decompose')).toEqual({ type: 'agent', ref: 'plan-decompose' })
  expect(d.resolveWorker('scaffold')).toEqual({ type: 'agent', ref: 'epic-scaffold' })
  expect(d.resolveWorker('roll-up')).toEqual({ type: 'agent', ref: 'epic-roll-up' })
  expect(d.resolveWorker('walk')?.type).toBe('skill')
})

// a3 — e2e: every resolved default worker-step across all tiers maps to a worker
test('no default worker-step is left unmapped across all tiers', () => {
  const defaultCfg = parse(
    readFileSync(
      new URL('../../../../default-template/anchored.default.yml', import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>
  const resolve = createResolveSteps(defaultCfg)
  const dispatch = createWorkerDispatch()
  const unmapped: string[] = []
  for (const tier of ['phase', 'task', 'epic']) {
    for (const stage of STAGES) {
      for (const step of resolve.resolve(tier, stage)) {
        if (dispatch.isStructural(step.name)) continue
        if (step.run !== undefined || step.each !== undefined) continue
        if (!dispatch.resolveWorker(step.name)) unmapped.push(`${tier}.${stage}.${step.name}`)
      }
    }
  }
  expect(unmapped).toEqual([])
})
