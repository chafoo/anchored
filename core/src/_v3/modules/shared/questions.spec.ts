import { test, expect } from 'bun:test'
import { addQuestion, resolveQuestion } from './questions.js'
import type { AnchoredError } from '../../lib/utils/error.js'

test('addQuestion assigns sequential id + open status (prefix configurable)', () => {
  const q1 = addQuestion([], { text: 'a', priority: 'high' })
  expect(q1[0]).toMatchObject({ id: 'q1', status: 'open', priority: 'high' })
  const q2 = addQuestion(q1, { text: 'b', priority: 'low' })
  expect(q2[1]!.id).toBe('q2')
  expect(addQuestion([], { text: 'c', priority: 'medium' }, 'c')[0]!.id).toBe('c1')
})

test('resolveQuestion sets answer/source; an AI resolution requires reasoning', () => {
  const open = addQuestion([], { text: 'a', priority: 'high' })
  const byUser = resolveQuestion(open, 'q1', { answer: 'yes', source: 'user' })
  expect(byUser[0]).toMatchObject({ status: 'resolved', answer: 'yes', source: 'user' })

  let err: unknown
  try {
    resolveQuestion(open, 'q1', { answer: 'x', source: 'ai' })
  } catch (e) {
    err = e
  }
  expect((err as AnchoredError).kind).toBe('MissingReasoning')
  expect(
    resolveQuestion(open, 'q1', { answer: 'x', source: 'ai', reasoning: 'because' })[0]!.reasoning,
  ).toBe('because')
})
