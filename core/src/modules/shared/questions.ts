// _v3/modules/shared/questions.ts — question/concern transforms (pure). add assigns a
// sequential id + status open; resolve sets answer/source/reasoning. An AI-resolved question
// MUST carry reasoning (the decision-trail invariant, read at wrap).
import { anchoredError } from '../../lib/utils/error.js'

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

/** The `→ build` gate (requirements-3 §5): a tier cannot advance into build while any
 *  question is still open. Throws `QuestionsOpen` LISTING the open questions, so the message
 *  itself tells the agent what to walk first. The asking is the skill's job; this only keeps
 *  the door shut and says why. */
export function assertNoOpenQuestions(questions: Question[], tier = 'node'): void {
  const open = questions.filter((q) => q.status === 'open')
  if (open.length > 0) {
    throw anchoredError(
      'QuestionsOpen',
      `cannot advance ${tier} to build: ${open.length} open question(s) — ${open
        .map((q) => `${q.id} (${q.priority})`)
        .join(', ')}`,
      ['resolve every open question first (the refine walk does this)'],
    )
  }
}

export function resolveQuestion(
  questions: Question[],
  id: string,
  resolution: QuestionResolution,
): Question[] {
  if (resolution.source === 'ai' && !(resolution.reasoning ?? '').trim()) {
    throw anchoredError(
      'MissingReasoning',
      `an AI-resolved question requires reasoning (q '${id}')`,
      ['pass reasoning: anchored <tier> question resolve <slug> <id> <answer> ai "<why>"'],
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
