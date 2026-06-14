import { test, expect } from 'bun:test'
import { anchoredError, type AnchoredError } from './error.js'

// the typed-error primitive is thrown everywhere — assert its exact shape so the
// CLI envelope can always render kind + suggestions the same way.

// a1 — kind + message + suggestions all land on the error
test('carries kind, message and suggestions', () => {
  const e = anchoredError('not-found', 'no such node', ['check the slug'])
  expect(e.kind).toBe('not-found')
  expect(e.message).toBe('no such node')
  expect(e.suggestions).toEqual(['check the slug'])
})

// a2 — it is a real Error (name aliases the kind, throwable/catchable)
test('is a real Error with name aliasing the kind', () => {
  const e = anchoredError('conflict', 'boom')
  expect(e).toBeInstanceOf(Error)
  expect(e.name).toBe('conflict')
})

// a3 — suggestions are optional: omitted stays undefined, never an empty array
test('omits suggestions when not given', () => {
  const e = anchoredError('bad-input', 'nope')
  expect(e.suggestions).toBeUndefined()
  expect('suggestions' in e).toBe(false)
})

// a4 — round-trips through throw/catch keeping its typed fields
test('round-trips through throw and catch', () => {
  let caught: AnchoredError | undefined
  try {
    throw anchoredError('invariant', 'evidence required', ['add-evidence first'])
  } catch (err) {
    caught = err as AnchoredError
  }
  expect(caught?.kind).toBe('invariant')
  expect(caught?.suggestions).toEqual(['add-evidence first'])
})
