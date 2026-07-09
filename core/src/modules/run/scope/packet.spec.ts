import { describe, test, expect } from 'bun:test'
import { selectGate, requestLine, reusableRequest } from './packet.js'
import { RunSchema } from '../run.schemas.js'
import { midFlightRun } from '../run.fixtures.js'
import type { AnchoredError } from '../../../lib/utils/error.js'

const run = RunSchema.parse(midFlightRun)

describe('selectGate', () => {
  test('a gate selects its open|failed criteria only', () => {
    const sel = selectGate(run, 'final')
    expect(sel.criteria.map((c) => c.id).sort()).toEqual(['c3', 'c4'])
    expect(sel.setup).toBe('frontend')
  })

  test('done and superseded criteria are never selected', () => {
    const layout = selectGate(run, 'layout-2') // c2 (superseded, gate layout) stays out
    expect(layout.criteria.map((c) => c.id)).toEqual(['c5'])
  })

  test('no gate = everything still provable across the run', () => {
    const sel = selectGate(run)
    expect(sel.criteria.map((c) => c.id).sort()).toEqual(['c3', 'c4', 'c5'])
  })

  test('an exhausted gate throws NothingToValidate with the provable gates', () => {
    try {
      selectGate(run, 'layout') // c1 done, c2 superseded → nothing left
      expect.unreachable()
    } catch (e) {
      expect((e as AnchoredError).kind).toBe('NothingToValidate')
      expect((e as AnchoredError).suggestions?.[0]).toContain('layout-2')
    }
  })

  test('a fully proven run suggests closing', () => {
    const proven = RunSchema.parse({
      goal: 'g',
      criteria: [
        {
          id: 'c1',
          text: 't',
          status: 'done',
          evidence: { by: 'validator', snapshot: 's', grounded: 'x', at: '2026-07-08T14:00:00Z' },
        },
      ],
    })
    try {
      selectGate(proven)
      expect.unreachable()
    } catch (e) {
      expect((e as AnchoredError).suggestions?.[0]).toContain('close')
    }
  })

  test('a setup-mixed selection is rejected (gates are setup-homogeneous)', () => {
    const mixed = RunSchema.parse({
      goal: 'g',
      criteria: [
        { id: 'c1', text: 'db', setup: 'backend', gate: 'x' },
        { id: 'c2', text: 'ui', setup: 'frontend', gate: 'x' },
      ],
    })
    try {
      selectGate(mixed, 'x')
      expect.unreachable()
    } catch (e) {
      expect((e as AnchoredError).kind).toBe('MixedGate')
      expect((e as Error).message).toContain('backend')
      expect((e as Error).message).toContain('frontend')
    }
  })
})

describe('reusableRequest', () => {
  const withTrail = (trail: unknown[]) =>
    RunSchema.parse({
      goal: 'g',
      criteria: [{ id: 'c1', text: 't', gate: 'g1' }],
      trail,
    })

  const selection = (r: ReturnType<typeof withTrail>) => selectGate(r, 'g1').criteria

  test('the same request for the same gate is reusable', () => {
    const r = withTrail([
      { at: '2026-07-08T14:00:00Z', gate: 'g1', validated: 'requested c1', snapshot: 'snap-a' },
    ])
    expect(reusableRequest(r, 'g1', selection(r))?.snapshot).toBe('snap-a')
  })

  test('a legacy entry (snapshot only in the prose) is never reused', () => {
    const r = withTrail([
      { at: '2026-07-08T14:00:00Z', gate: 'g1', validated: 'requested c1 (snapshot snap-a)' },
    ])
    expect(reusableRequest(r, 'g1', selection(r))).toBeUndefined()
  })

  test('a different gate, and a claim entry, are not the prior request', () => {
    const r = withTrail([
      { at: '2026-07-08T14:00:00Z', gate: 'other', validated: 'requested c1', snapshot: 'snap-a' },
      { at: '2026-07-08T14:01:00Z', claim: 'did the work' },
    ])
    expect(reusableRequest(r, 'g1', selection(r))).toBeUndefined()
  })

  test('evidence written since the request (a fail) forces a fresh snapshot', () => {
    const r = RunSchema.parse({
      goal: 'g',
      criteria: [
        {
          id: 'c1',
          text: 't',
          gate: 'g1',
          status: 'failed',
          evidence: {
            by: 'validator',
            snapshot: 'snap-a',
            verdict: 'off by 4px',
            at: '2026-07-08T14:05:00Z', // AFTER the request below
          },
        },
      ],
      trail: [
        { at: '2026-07-08T14:00:00Z', gate: 'g1', validated: 'requested c1', snapshot: 'snap-a' },
      ],
    })
    expect(reusableRequest(r, 'g1', selectGate(r, 'g1').criteria)).toBeUndefined()
  })

  test('requestLine names the selected criteria in order', () => {
    expect(requestLine(selectGate(run, 'final').criteria)).toBe('requested c3, c4')
  })
})
