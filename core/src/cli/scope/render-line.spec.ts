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
