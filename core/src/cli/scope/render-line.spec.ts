// _v3/cli/scope/render-line.spec.ts — unit: the agent-format line renderer. Faked input only
// (plain Envelope objects), no modules, no I/O → a spec.
import { test, expect } from 'bun:test'
import { renderLine } from './render-line.js'
import type { Envelope } from '../envelope.js'

test('a success line carries command · summary · next, no JSON blob', () => {
  const env: Envelope = {
    ok: true,
    command: 'task status',
    next: 'phase → setup',
    result: { slug: 'my-task', status: 'build' },
  }
  const line = renderLine(env)
  expect(line).toBe('task status · slug: my-task · status: build · next: phase → setup')
  expect(line).not.toContain('{')
})

test('no next hint → no next segment', () => {
  const line = renderLine({ ok: true, command: 'task get', result: { slug: 't', status: 'plan' } })
  expect(line).toBe('task get · slug: t · status: plan')
})

test('an error line renders the fix from suggestions (F3)', () => {
  const env: Envelope = {
    ok: false,
    command: 'phase status',
    error: {
      name: 'InvalidTransition',
      message: 'illegal phase transition: pending → done',
      suggestions: ['in-progress'],
    },
  }
  const line = renderLine(env)
  expect(line).toContain('error[InvalidTransition]')
  expect(line).toContain('illegal phase transition')
  expect(line).toContain('fix: in-progress')
})

test('an error line without suggestions still renders cleanly', () => {
  const line = renderLine({
    ok: false,
    command: 'task get',
    error: { name: 'NotFound', message: 'no such node' },
  })
  expect(line).toBe('task get · error[NotFound]: no such node')
})

test('a stage-plan result summarizes stage + node + step count, full values', () => {
  const env: Envelope = {
    ok: true,
    command: 'task build',
    result: {
      tier: 'task',
      stage: 'build',
      steps: [{ name: 'implement' }],
      node: { slug: 'my-task', status: 'build' },
    },
  }
  expect(renderLine(env)).toContain('stage: build · node: my-task · status: build · steps: 1')
})

test('a null result reads as ok', () => {
  expect(renderLine({ ok: true, command: 'x y', result: null })).toBe('x y · ok')
})

test('an unknown-shape result keeps the line complete via compact JSON', () => {
  const line = renderLine({ ok: true, command: 'a b', result: { foo: 'bar', n: 2 } })
  expect(line).toBe('a b · {"foo":"bar","n":2}')
})

test('children array (roll-up/archive) is listed inline', () => {
  const line = renderLine({
    ok: true,
    command: 'epic archive',
    result: { slug: 'ep', archived: true, children: ['ep/login', 'ep/logout'] },
  })
  expect(line).toContain('slug: ep · archived · children: ep/login, ep/logout')
})

// --- generic collection-item rendering (C6, generalized across all collections) ---

// `<coll> list` returns an array → one dense agent-line per item, command-prefixed. Questions:
// the existing format `q1 · status: open · priority: high · <text>` must be reproduced exactly.
test('a question list renders one dense line per question (id · status · priority · text)', () => {
  const line = renderLine({
    ok: true,
    command: 'epic question list',
    result: [
      { id: 'q1', status: 'open', priority: 'high', text: 'monolith or service?' },
      { id: 'q2', status: 'resolved', priority: 'low', text: 'which datastore?' },
    ],
  })
  expect(line).toBe(
    'epic question list · q1 · status: open · priority: high · monolith or service?\n' +
      'epic question list · q2 · status: resolved · priority: low · which datastore?',
  )
  expect(line).not.toContain('{')
})

// an empty list reads cleanly (no JSON blob) — generic empty message across all collections.
test('an empty list reads as "(none)"', () => {
  expect(renderLine({ ok: true, command: 'task question list', result: [] })).toBe(
    'task question list · (none)',
  )
})

// `<coll> get` returns a single item → its dense line in the standard command · body shape.
test('a single question (question get) renders as its dense line', () => {
  const line = renderLine({
    ok: true,
    command: 'task question get',
    result: { id: 'q1', status: 'open', priority: 'medium', text: 'which auth provider?' },
  })
  expect(line).toBe(
    'task question get · q1 · status: open · priority: medium · which auth provider?',
  )
})

// child item: identifier is `slug` (no id), free-text is `goal` → bare-last, no `priority`.
test('a child list renders slug · status · <goal> (slug identifier, goal as bare text)', () => {
  const line = renderLine({
    ok: true,
    command: 'epic child list',
    result: [
      { slug: 'ep/login', status: 'pending', goal: 'add a login form' },
      { slug: 'ep/logout', status: 'done', goal: 'clear the session' },
    ],
  })
  expect(line).toBe(
    'epic child list · ep/login · status: pending · add a login form\n' +
      'epic child list · ep/logout · status: done · clear the session',
  )
})

// ac item: id + status + text → `a1 · status: done · <text>` (no priority field present).
test('an ac list renders id · status · <text>', () => {
  const line = renderLine({
    ok: true,
    command: 'task ac list',
    result: [{ id: 'a1', status: 'done', text: 'returns 200 on success' }],
  })
  expect(line).toBe('task ac list · a1 · status: done · returns 200 on success')
})

// log item: no id/slug → lead with the first scalar; `note` is the bare-last free-text field.
test('a log list (no id/slug) leads with the first scalar, note bare-last', () => {
  const line = renderLine({
    ok: true,
    command: 'task log list',
    result: [{ at: '2026-06-16', kind: 'decision', note: 'chose postgres' }],
  })
  expect(line).toBe('task log list · at: 2026-06-16 · kind: decision · chose postgres')
})

// a single child get is an item, not a node — {slug,status,goal} has no node count-arrays.
test('a single child (child get) renders as a dense item line, not a node summary', () => {
  const line = renderLine({
    ok: true,
    command: 'epic child get',
    result: { slug: 'ep/login', status: 'pending', goal: 'add a login form' },
  })
  expect(line).toBe('epic child get · ep/login · status: pending · add a login form')
})

// a real node ({slug,status,phases:[…]}) must STAY on the summarize() path, never the item line.
test('a node result with count-arrays still summarizes (not mis-rendered as an item)', () => {
  const line = renderLine({
    ok: true,
    command: 'task get',
    result: { slug: 'my-task', status: 'build', phases: [{}, {}], acceptance: [{}] },
  })
  expect(line).toBe('task get · slug: my-task · status: build · phases: 2 · acceptance: 1')
})

// extra scalar fields render labelled, in insertion order, after status/priority; text stays last.
test('an item with extra scalars keeps status/priority first and the text bare-last', () => {
  const line = renderLine({
    ok: true,
    command: 'task concern get',
    result: { id: 'c1', severity: 'high', status: 'open', priority: 'medium', text: 'flaky test' },
  })
  expect(line).toBe(
    'task concern get · c1 · status: open · priority: medium · severity: high · flaky test',
  )
})
