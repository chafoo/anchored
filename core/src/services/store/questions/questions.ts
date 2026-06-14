// store/questions/questions.ts — question helpers (pure). add assigns a sequential id +
// status open; resolve sets answer/source/reasoning + status resolved. An
// AI-resolved question MUST carry reasoning (the decision-trail invariant).
import { anchoredError } from '../../../lib/utils/error.js'

export interface Question {
  id: string
  text: string
  priority: string
  origin?: string
  status: string
  answer?: string
  source?: string
  reasoning?: string
}

export interface QuestionInit {
  text: string
  priority: 'low' | 'medium' | 'high'
  origin?: string
}

export interface QuestionResolution {
  answer: string
  source: 'user' | 'ai'
  reasoning?: string
}

export function addQuestion(questions: Question[], init: QuestionInit, idPrefix = 'q'): Question[] {
  const q: Question = {
    id: `${idPrefix}${questions.length + 1}`,
    text: init.text,
    priority: init.priority,
    status: 'open',
  }
  if (init.origin !== undefined) q.origin = init.origin
  return [...questions, q]
}

export function resolveQuestion(
  questions: Question[],
  id: string,
  resolution: QuestionResolution,
): Question[] {
  // decision-trail invariant: an AI decision must record WHY (read by /a:wrap)
  if (resolution.source === 'ai' && !(resolution.reasoning ?? '').trim()) {
    throw anchoredError(
      'MissingReasoning',
      `an AI-resolved question requires reasoning (q '${id}')`,
      ['pass reasoning: anchored node resolve-question <slug> <id> <answer> ai "<why>"'],
    )
  }
  return questions.map((q) =>
    q.id === id
      ? {
          ...q,
          status: 'resolved',
          answer: resolution.answer,
          source: resolution.source,
          ...(resolution.reasoning !== undefined ? { reasoning: resolution.reasoning } : {}),
        }
      : q,
  )
}
