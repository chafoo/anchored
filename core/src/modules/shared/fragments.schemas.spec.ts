import { test, expect } from 'bun:test'
import {
  KebabSlug,
  NestedSlug,
  AcceptanceCriterion,
  AcceptanceItem,
  QuestionSchema,
} from './fragments.schemas.js'

test('slugs: kebab only vs nested-allowed', () => {
  expect(KebabSlug.safeParse('my-task').success).toBe(true)
  expect(KebabSlug.safeParse('a/b').success).toBe(false)
  expect(NestedSlug.safeParse('my-epic/my-task').success).toBe(true)
  expect(NestedSlug.safeParse('a/b/c').success).toBe(false)
})

test('AcceptanceCriterion enforces the evidence invariant (done needs evidence)', () => {
  const done = (evidence?: string[]) => ({
    id: 'a1',
    text: 't',
    status: 'done' as const,
    ...(evidence && { evidence }),
  })
  expect(AcceptanceCriterion.safeParse(done()).success).toBe(false)
  expect(AcceptanceCriterion.safeParse(done([])).success).toBe(false)
  expect(AcceptanceCriterion.safeParse(done(['src/x.ts:1 — p'])).success).toBe(true)
  expect(AcceptanceCriterion.safeParse({ id: 'a1', text: 't', status: 'pending' }).success).toBe(
    true,
  )
})

test('AcceptanceCriterion + AcceptanceItem enforce the deferral invariant (deferred needs reason)', () => {
  const deferred = (reason?: string) => ({
    id: 'a1',
    text: 't',
    status: 'deferred' as const,
    reason,
  })
  expect(AcceptanceCriterion.safeParse(deferred()).success).toBe(false) // no reason
  expect(AcceptanceCriterion.safeParse(deferred('  ')).success).toBe(false) // blank reason
  expect(AcceptanceCriterion.safeParse(deferred('out of scope')).success).toBe(true)
  // the DoD item carries the same two invariants
  expect(AcceptanceItem.safeParse({ id: 'e1', text: 't', status: 'done' }).success).toBe(false)
  expect(
    AcceptanceItem.safeParse({ id: 'e1', text: 't', status: 'done', evidence: ['x'] }).success,
  ).toBe(true)
  expect(AcceptanceItem.safeParse({ id: 'e1', text: 't', status: 'deferred' }).success).toBe(false)
  expect(
    AcceptanceItem.safeParse({ id: 'e1', text: 't', status: 'deferred', reason: 'phase 2' })
      .success,
  ).toBe(true)
})

test('QuestionSchema accepts an ai-resolved question shape', () => {
  expect(
    QuestionSchema.safeParse({
      id: 'q1',
      text: 't',
      priority: 'high',
      status: 'resolved',
      answer: 'x',
      source: 'ai',
      reasoning: 'why',
    }).success,
  ).toBe(true)
})
