import { test, expect } from 'bun:test'
import { KebabSlug, NestedSlug, AcceptanceCriterion, QuestionSchema } from './fragments.schemas.js'

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
