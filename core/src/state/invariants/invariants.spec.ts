import { test, expect } from 'bun:test'
import {
  isEvidenceFilled,
  assertAcDoneHasEvidence,
  assertNodeCompletable,
  type AnchoredError,
} from './invariants.js'
import { AcceptanceCriterion } from '../../schema/tiers/phase.js'

// a1 — assertAcDoneHasEvidence throws without evidence, no-op with
test('assertAcDoneHasEvidence enforces evidence for done', () => {
  expect(() => assertAcDoneHasEvidence({ id: 'a1', status: 'done', evidence: [] })).toThrow()
  expect(() =>
    assertAcDoneHasEvidence({ id: 'a1', status: 'done', evidence: ['src/x.ts:42 — proof'] }),
  ).not.toThrow()
  expect(() => assertAcDoneHasEvidence({ id: 'a1', status: 'pending' })).not.toThrow()
  let err: unknown
  try {
    assertAcDoneHasEvidence({ id: 'a1', status: 'done' })
  } catch (e) {
    err = e
  }
  expect((err as AnchoredError).suggestions?.length).toBeGreaterThan(0)
})

// a2 — isEvidenceFilled is a pure table-driven predicate
test('isEvidenceFilled rejects empty/whitespace/sentinel, accepts real', () => {
  expect(isEvidenceFilled([])).toBe(false)
  expect(isEvidenceFilled(['  '])).toBe(false)
  expect(isEvidenceFilled(['—'])).toBe(false)
  expect(isEvidenceFilled(null)).toBe(false)
  expect(isEvidenceFilled(undefined)).toBe(false)
  expect(isEvidenceFilled(['src/x.ts:42 — foo'])).toBe(true)
})

// a3 — Zod layer mirrors the invariant (second line of defence)
test('AcceptanceCriterion schema rejects done without evidence', () => {
  expect(AcceptanceCriterion.safeParse({ id: 'a1', text: 't', status: 'done' }).success).toBe(false)
  expect(
    AcceptanceCriterion.safeParse({ id: 'a1', text: 't', status: 'done', evidence: ['x:1 — p'] })
      .success,
  ).toBe(true)
  expect(AcceptanceCriterion.safeParse({ id: 'a1', text: 't', status: 'pending' }).success).toBe(
    true,
  )
})

// a4 — assertNodeCompletable names the unbacked AC(s)
test('assertNodeCompletable rejects a partially-backed node', () => {
  const node = {
    acceptance_criteria: [
      { id: 'a1', status: 'done', evidence: ['x:1 — p'] },
      { id: 'a2', status: 'pending', evidence: [] },
    ],
  }
  let err: unknown
  try {
    assertNodeCompletable(node)
  } catch (e) {
    err = e
  }
  expect(err).toBeDefined()
  expect((err as AnchoredError).message).toContain('a2')
})
