// _v3/cli/scope/read-stdin-arg.spec.ts — unit: the G2/G3 `-` substitution. Pure with an injected
// reader (a closure returning a fixed string) → a spec.
import { test, expect } from 'bun:test'
import { readStdinArg } from './read-stdin-arg.js'

test('no `-` → rest is unchanged and stdin is never read', () => {
  let read = 0
  const out = readStdinArg(['my-task', 'a1', 'some text'], () => {
    read++
    return 'STDIN'
  })
  expect(out).toEqual(['my-task', 'a1', 'some text'])
  expect(read).toBe(0)
})

test('a single `-` is replaced by the stdin body (G2)', () => {
  const out = readStdinArg(['my-task', 'a1', '-'], () => 'verified via app.js:27')
  expect(out).toEqual(['my-task', 'a1', 'verified via app.js:27'])
})

test('the body may be a JSON payload for a bulk verb (G3) — passed through verbatim', () => {
  const payload = '{ "phases": [ { "slug": "p1" } ] }'
  const out = readStdinArg(['my-task', '-'], () => payload)
  expect(out).toEqual(['my-task', payload])
})

test('only the FIRST `-` is honoured (one body value); a second stays literal', () => {
  const out = readStdinArg(['-', 'x', '-'], () => 'BODY')
  expect(out).toEqual(['BODY', 'x', '-'])
})
