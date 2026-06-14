import { test, expect } from 'bun:test'
import {
  isEvidenceFilled,
  assertAcDoneHasEvidence,
  assertEpicAcHasEvidence,
  assertNodeCompletable,
} from './invariants.js'
import { type AnchoredError } from '../../../error.js'
import { AcceptanceCriterion } from '../../../domain/tiers/phase.js'

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

// a5 — assertEpicAcHasEvidence is the epic-tier sibling: done needs merged evidence
test('assertEpicAcHasEvidence enforces delivery evidence for a done epic item', () => {
  expect(() => assertEpicAcHasEvidence('e1', 'done', [])).toThrow()
  expect(() => assertEpicAcHasEvidence('e1', 'done', undefined)).toThrow()
  expect(() => assertEpicAcHasEvidence('e1', 'done', ['task/phase — delivered'])).not.toThrow()
  expect(() => assertEpicAcHasEvidence('e1', 'pending', undefined)).not.toThrow()
  let err: unknown
  try {
    assertEpicAcHasEvidence('e1', 'done', [])
  } catch (e) {
    err = e
  }
  expect((err as AnchoredError).name).toBe('AcceptanceNoEvidence')
  expect((err as AnchoredError).message).toBe(
    "acceptance item 'e1' cannot be done without delivery evidence",
  )
  expect((err as AnchoredError).suggestions?.[0]).toBe(
    'pass the provenance pointer(s): set-acceptance-status <slug> e1 done "<task>/<phase> — delivered"',
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
