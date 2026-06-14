import { test, expect } from 'bun:test'
import {
  KebabSlug,
  NestedSlug,
  Rule,
  AcceptanceCriterion,
  QuestionSchema,
  LogEntrySchema,
  ContextTrails,
} from './schema.js'

// a1 — KebabSlug accepts kebab, rejects upper/space/leading-dash
test('KebabSlug enforces kebab-case', () => {
  expect(KebabSlug.safeParse('foo').success).toBe(true)
  expect(KebabSlug.safeParse('foo-bar-2').success).toBe(true)
  expect(KebabSlug.safeParse('Foo').success).toBe(false)
  expect(KebabSlug.safeParse('foo bar').success).toBe(false)
  expect(KebabSlug.safeParse('-foo').success).toBe(false)
  expect(KebabSlug.safeParse('foo/bar').success).toBe(false)
})

// a2 — NestedSlug additionally allows a single <epic>/<slug> segment
test('NestedSlug allows one optional nested segment', () => {
  expect(NestedSlug.safeParse('foo').success).toBe(true)
  expect(NestedSlug.safeParse('epic/foo-bar').success).toBe(true)
  // only one level of nesting permitted
  expect(NestedSlug.safeParse('a/b/c').success).toBe(false)
  expect(NestedSlug.safeParse('Epic/foo').success).toBe(false)
})

// a3 — Rule is a strict {path, why}; extra keys rejected
test('Rule is a strict path/why object', () => {
  expect(Rule.safeParse({ path: 'p', why: 'w' }).success).toBe(true)
  expect(Rule.safeParse({ path: 'p' }).success).toBe(false)
  expect(Rule.safeParse({ path: 'p', why: 'w', extra: 1 }).success).toBe(false)
})

// a4 — AcceptanceCriterion mirrors the invariant: done needs non-empty evidence
test('AcceptanceCriterion requires evidence only for done', () => {
  expect(AcceptanceCriterion.safeParse({ id: 'a1', text: 't', status: 'pending' }).success).toBe(
    true,
  )
  expect(AcceptanceCriterion.safeParse({ id: 'a1', text: 't', status: 'done' }).success).toBe(false)
  expect(
    AcceptanceCriterion.safeParse({ id: 'a1', text: 't', status: 'done', evidence: ['  '] })
      .success,
  ).toBe(false)
  expect(
    AcceptanceCriterion.safeParse({ id: 'a1', text: 't', status: 'done', evidence: ['x:1 — p'] })
      .success,
  ).toBe(true)
})

// a5 — AcceptanceCriterion carries an optional failures trail; status enum is closed
test('AcceptanceCriterion accepts a failures trail, rejects unknown status', () => {
  expect(
    AcceptanceCriterion.safeParse({
      id: 'a1',
      text: 't',
      status: 'pending',
      failures: ['gate rejected: lint'],
    }).success,
  ).toBe(true)
  expect(AcceptanceCriterion.safeParse({ id: 'a1', text: 't', status: 'wip' }).success).toBe(false)
})

// a6 — QuestionSchema: required core + closed enums, optionals tolerated
test('QuestionSchema validates priority/status enums and optionals', () => {
  expect(
    QuestionSchema.safeParse({ id: 'q1', text: 't', priority: 'high', status: 'open' }).success,
  ).toBe(true)
  expect(
    QuestionSchema.safeParse({
      id: 'q1',
      text: 't',
      priority: 'low',
      status: 'resolved',
      origin: 'plan',
      answer: 'a',
      source: 'ai',
      reasoning: 'r',
      phase: 'p1',
    }).success,
  ).toBe(true)
  expect(
    QuestionSchema.safeParse({ id: 'q1', text: 't', priority: 'urgent', status: 'open' }).success,
  ).toBe(false)
  expect(
    QuestionSchema.safeParse({ id: 'q1', text: 't', priority: 'high', status: 'pending' }).success,
  ).toBe(false)
  // source enum is closed to user|ai
  expect(
    QuestionSchema.safeParse({
      id: 'q1',
      text: 't',
      priority: 'high',
      status: 'open',
      source: 'bot',
    }).success,
  ).toBe(false)
})

// a7 — LogEntrySchema is a strict at/kind/note triple
test('LogEntrySchema is a strict at/kind/note triple', () => {
  expect(LogEntrySchema.safeParse({ at: 'now', kind: 'k', note: 'n' }).success).toBe(true)
  expect(LogEntrySchema.safeParse({ at: 'now', kind: 'k' }).success).toBe(false)
  expect(LogEntrySchema.safeParse({ at: 'now', kind: 'k', note: 'n', extra: 1 }).success).toBe(
    false,
  )
})

// a8 — ContextTrails: all four stage trails optional, empty object valid, extras rejected
test('ContextTrails accepts any subset of stage trails', () => {
  expect(ContextTrails.safeParse({}).success).toBe(true)
  expect(ContextTrails.safeParse({ plan: 'p', wrap: 'w' }).success).toBe(true)
  expect(ContextTrails.safeParse({ plan: 'p', refine: 'r', build: 'b', wrap: 'w' }).success).toBe(
    true,
  )
  expect(ContextTrails.safeParse({ stage: 'x' }).success).toBe(false)
})
