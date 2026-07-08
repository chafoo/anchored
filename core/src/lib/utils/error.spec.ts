import { test, expect } from 'bun:test'
import { anchoredError, type AnchoredError } from './error.js'

test('anchoredError builds a typed Error with kind + suggestions', () => {
  const e = anchoredError('WriteContention', 'file changed', ['re-read and retry'])
  expect(e).toBeInstanceOf(Error)
  expect(e.kind).toBe('WriteContention')
  expect(e.name).toBe('WriteContention')
  expect(e.message).toBe('file changed')
  expect(e.suggestions).toEqual(['re-read and retry'])
})

test('suggestions are omitted when not passed; it throws + catches as AnchoredError', () => {
  const e = anchoredError('Bad', 'nope')
  expect('suggestions' in e).toBe(false)
  let caught: unknown
  try {
    throw e
  } catch (x) {
    caught = x
  }
  expect((caught as AnchoredError).kind).toBe('Bad')
})
