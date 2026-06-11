// ops/scope/questions.ts — question helpers (pure). add assigns a sequential id +
// status open; resolve sets answer/source/reasoning + status resolved.

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

export function addQuestion(questions: Question[], init: QuestionInit): Question[] {
  const q: Question = {
    id: `q${questions.length + 1}`,
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
