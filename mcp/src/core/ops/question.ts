/**
 * Question-level ops: add / list / resolve / retag.
 *
 * Implements the V0.3 structured Q&A surface — replaces the V0.2
 * free-text `→ ?` markers embedded in `context.plan`. Each question
 * is a structured item in the top-level `questions[]` array on the
 * task-file, tagged with priority (low/medium/high) and origin
 * (which agent wrote it). Resolution captures source (user vs ai)
 * and, for AI resolutions, the reasoning.
 *
 * Lifecycle:
 *   - Agents call `task.question.add` to surface ambiguity. IDs are
 *     assigned sequentially (q1, q2, q3, ...).
 *   - Orchestrator skills call `task.question.list({ status: 'open' })`
 *     to drive the Q&A loop in /impl-refine stage 3 + /impl-build
 *     pre-flight gate.
 *   - User answers and AI autonomous decisions both flow through
 *     `task.question.resolve` — same op, distinguished by `source`.
 *
 * The free-text trail (context.plan) stays untouched by these ops —
 * it remains a human-readable narrative the plan-agent and SKILLs
 * write to with markdown prose. Questions are the structured channel.
 */

import { readTask, writeTask, type Deps } from './task.js';
import type {
  TaskFile,
  Question,
  QuestionPriority,
  QuestionOrigin,
  QuestionSource,
  QuestionStatus,
} from '../../schema/task-file.js';
import {
  QuestionNotFound,
  InvalidQuestionResolution,
} from '../errors.js';

// ─────────────────────────────────────────────────────────────────────
// caller-facing input shapes
// ─────────────────────────────────────────────────────────────────────

export interface QuestionAddInput {
  text: string;
  priority: QuestionPriority;
  origin: QuestionOrigin;
  /** Optional phase context — the phase slug the question pertains to. */
  phase?: string;
}

export interface QuestionResolveInput {
  answer: string;
  source: QuestionSource;
  /** Required when source='ai'; forbidden when source='user'. */
  reasoning?: string;
}

export interface QuestionListFilter {
  priority?: QuestionPriority;
  status?: QuestionStatus;
  phase?: string;
}

// ─────────────────────────────────────────────────────────────────────
// shared helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Compute the next sequential question id. Scans existing IDs for
 * the largest `q<N>` and returns `q<N+1>`. Returns `q1` if the array
 * is empty / missing.
 */
function nextQuestionId(questions: Question[] | undefined): string {
  if (!questions || questions.length === 0) return 'q1';
  let maxN = 0;
  for (const q of questions) {
    const match = /^q(\d+)$/.exec(q.id);
    if (match && match[1]) {
      const n = parseInt(match[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  return `q${maxN + 1}`;
}

function findQuestionOrThrow(file: TaskFile, id: string): Question {
  const questions = file.questions ?? [];
  const question = questions.find((q) => q.id === id);
  if (!question) {
    const known = questions.map((q) => q.id);
    const suggestions: string[] = [];
    if (known.length === 0) {
      suggestions.push(
        `This task has no questions yet. Add one via \`task.question.add\` before resolving.`,
      );
    } else {
      suggestions.push(
        `Known question ids: ${known.join(', ')}. Did you mean one of these?`,
        `List open questions: \`task.question.list({ status: 'open' })\`.`,
      );
    }
    throw new QuestionNotFound(
      `question id "${id}" not found in task "${file.slug}"`,
      suggestions,
    );
  }
  return question;
}

// ─────────────────────────────────────────────────────────────────────
// task.question.add
// ─────────────────────────────────────────────────────────────────────

/**
 * Append a new question to the task. Returns the assigned id alongside
 * the updated file so callers can reference the just-added question
 * without re-scanning the array.
 */
export function makeQuestionAdd({ root }: Deps) {
  return async (
    slug: string,
    input: QuestionAddInput,
  ): Promise<{ id: string; file: TaskFile }> => {
    const file = await readTask(root, slug);

    const id = nextQuestionId(file.questions);
    const now = new Date().toISOString();

    const question: Question = {
      id,
      text: input.text,
      priority: input.priority,
      origin: input.origin,
      status: 'open',
      created_at: now,
      ...(input.phase !== undefined ? { phase: input.phase } : {}),
    };

    const questions = file.questions ?? [];
    questions.push(question);
    file.questions = questions;

    const written = await writeTask(root, slug, file);
    return { id, file: written };
  };
}

// ─────────────────────────────────────────────────────────────────────
// task.question.list
// ─────────────────────────────────────────────────────────────────────

/**
 * List questions, optionally filtered. Returns array in insertion
 * order (matches the on-disk order — stable for callers driving a
 * Q&A loop).
 */
export function makeQuestionList({ root }: Deps) {
  return async (
    slug: string,
    filter?: QuestionListFilter,
  ): Promise<Question[]> => {
    const file = await readTask(root, slug);
    const questions = file.questions ?? [];
    if (!filter) return [...questions];
    return questions.filter((q) => {
      if (filter.priority !== undefined && q.priority !== filter.priority) return false;
      if (filter.status !== undefined && q.status !== filter.status) return false;
      if (filter.phase !== undefined && q.phase !== filter.phase) return false;
      return true;
    });
  };
}

// ─────────────────────────────────────────────────────────────────────
// task.question.resolve
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve (or re-resolve) a question. Idempotent — calling this on an
 * already-resolved question updates the fields and refreshes
 * resolved_at. Validates the source/reasoning invariants before
 * touching the file.
 */
export function makeQuestionResolve({ root }: Deps) {
  return async (
    slug: string,
    id: string,
    input: QuestionResolveInput,
  ): Promise<TaskFile> => {
    if (input.answer.trim() === '') {
      throw new InvalidQuestionResolution(
        `cannot resolve question "${id}" with an empty answer`,
        [
          `Pass a non-empty answer string.`,
          `For "I don't know yet", leave the question status='open' and revisit.`,
        ],
      );
    }
    if (input.source === 'ai' && (input.reasoning === undefined || input.reasoning.trim() === '')) {
      throw new InvalidQuestionResolution(
        `AI resolutions must include non-empty reasoning (question "${id}")`,
        [
          `Pass a reasoning string explaining WHY the AI picked this answer.`,
          `The /impl-wrap reviewer reads this to understand autonomous decisions.`,
        ],
      );
    }
    if (input.source === 'user' && input.reasoning !== undefined && input.reasoning.trim() !== '') {
      throw new InvalidQuestionResolution(
        `user resolutions cannot include reasoning (question "${id}")`,
        [
          `Omit the reasoning field for source='user'.`,
          `Reasoning is the AI's audit trail — user answers carry no extra justification.`,
        ],
      );
    }

    const file = await readTask(root, slug);
    const question = findQuestionOrThrow(file, id);

    const now = new Date().toISOString();
    question.status = 'resolved';
    question.answer = input.answer;
    question.source = input.source;
    question.resolved_at = now;
    if (input.source === 'ai') {
      question.reasoning = input.reasoning;
    } else {
      // user resolution — clear any prior reasoning from a stale AI resolution
      delete (question as { reasoning?: string }).reasoning;
    }

    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// task.question.retag
// ─────────────────────────────────────────────────────────────────────

/**
 * Change the priority of an existing question. Used by plan-check /
 * rules-check when they disagree with the priority the plan-agent
 * originally assigned (e.g. plan-agent tagged a UX decision as `low`,
 * plan-check upgrades to `medium`). The text + answer + status fields
 * are unchanged.
 */
export function makeQuestionRetag({ root }: Deps) {
  return async (
    slug: string,
    id: string,
    priority: QuestionPriority,
  ): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const question = findQuestionOrThrow(file, id);
    question.priority = priority;
    return writeTask(root, slug, file);
  };
}
