// _v3/modules/shared/acceptance.spec.ts — the pure AC primitives in isolation (no store, no
// schema). Verifies id-allocation, the evidence-flips-done + failures-retire lifecycle, and the
// fail-back-to-pending path. The evidence INVARIANT (done needs evidence) is the schema's job,
// not these transforms' — these only shape the array.
import { test, expect } from 'bun:test'
import {
  addAc,
  evidenceAc,
  failAc,
  doneAc,
  deferAc,
  setAcText,
  nextAcId,
  retireFailures,
} from './acceptance.js'
import type { AcLike } from './acceptance.js'

const empty: AcLike[] = []

test('nextAcId: max existing + 1, ignores non-aN ids', () => {
  expect(nextAcId([])).toBe('a1')
  expect(nextAcId([{ id: 'a1' }, { id: 'a3' }, { id: 'x' }])).toBe('a4')
})

test('addAc: appends a pending AC with an auto id', () => {
  const acs = addAc(addAc(empty, 'first'), 'second')
  expect(acs).toEqual([
    { id: 'a1', text: 'first', status: 'pending' },
    { id: 'a2', text: 'second', status: 'pending' },
  ])
})

test('addAc: honours an explicit id and rejects a duplicate', () => {
  const acs = addAc(empty, 'x', 'a7')
  expect(acs[0]!.id).toBe('a7')
  expect(() => addAc(acs, 'y', 'a7')).toThrow(/already exists/)
})

test('evidenceAc: appends proof, flips done, retires prior failures', () => {
  const base = failAc(addAc(empty, 'must pass'), 'a1', 'gate said no')
  expect(base[0]).toMatchObject({ status: 'pending', failures: ['gate said no'] })
  const passed = evidenceAc(base, 'a1', 'src/x.ts — proof')
  expect(passed[0]).toEqual({
    id: 'a1',
    text: 'must pass',
    status: 'done',
    evidence: ['src/x.ts — proof'],
  })
  expect('failures' in passed[0]!).toBe(false)
})

test('evidenceAc: accumulates multiple proofs', () => {
  const acs = evidenceAc(evidenceAc(addAc(empty, 'x'), 'a1', 'one'), 'a1', 'two')
  expect(acs[0]!.evidence).toEqual(['one', 'two'])
})

test('failAc: records the failure and reverts to pending', () => {
  const done = evidenceAc(addAc(empty, 'x'), 'a1', 'proof')
  const failed = failAc(done, 'a1', 'regressed')
  expect(failed[0]).toMatchObject({
    status: 'pending',
    failures: ['regressed'],
    evidence: ['proof'],
  })
})

test('doneAc: flips status without touching evidence, retires failures', () => {
  const base = failAc(evidenceAc(addAc(empty, 'x'), 'a1', 'proof'), 'a1', 'oops')
  const done = doneAc(base, 'a1')
  expect(done[0]).toEqual({ id: 'a1', text: 'x', status: 'done', evidence: ['proof'] })
})

test('deferAc: records a reason, flips to deferred, retires failures', () => {
  const base = failAc(addAc(empty, 'x'), 'a1', 'gate said no')
  const deferred = deferAc(base, 'a1', 'out of scope this milestone')
  expect(deferred[0]).toEqual({
    id: 'a1',
    text: 'x',
    status: 'deferred',
    reason: 'out of scope this milestone',
  })
  expect('failures' in deferred[0]!).toBe(false)
})

test('setAcText: edits the wording, leaving status/evidence untouched', () => {
  const done = evidenceAc(addAc(empty, 'old'), 'a1', 'proof')
  const retitled = setAcText(done, 'a1', 'sharper wording')
  expect(retitled[0]).toEqual({
    id: 'a1',
    text: 'sharper wording',
    status: 'done',
    evidence: ['proof'],
  })
})

test('setAcText: a blank text throws AcNoText', () => {
  expect(() => setAcText(addAc(empty, 'x'), 'a1', '')).toThrow(/empty/)
  expect(() => setAcText(addAc(empty, 'x'), 'a1', '   ')).toThrow(/empty/)
})

test('mutators throw on an unknown id', () => {
  expect(() => evidenceAc(addAc(empty, 'x'), 'a9', 'p')).toThrow(/no acceptance criterion 'a9'/)
  expect(() => failAc(addAc(empty, 'x'), 'a9', 'w')).toThrow(/no acceptance criterion 'a9'/)
  expect(() => doneAc(addAc(empty, 'x'), 'a9')).toThrow(/no acceptance criterion 'a9'/)
  expect(() => deferAc(addAc(empty, 'x'), 'a9', 'r')).toThrow(/no acceptance criterion 'a9'/)
  expect(() => setAcText(addAc(empty, 'x'), 'a9', 'new')).toThrow(/no acceptance criterion 'a9'/)
})

test('deferAc: a missing/blank reason throws a clean AcNoReason (not a raw schema error)', () => {
  expect(() => deferAc(addAc(empty, 'x'), 'a1', '')).toThrow(/without a reason/)
  expect(() => deferAc(addAc(empty, 'x'), 'a1', '   ')).toThrow(/without a reason/)
})

test('retireFailures: no-op when there are no failures', () => {
  const ac = { id: 'a1', text: 'x', status: 'done' as const, evidence: ['p'] }
  expect(retireFailures(ac)).toBe(ac)
})
