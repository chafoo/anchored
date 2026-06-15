// _v3/cli/scope/exit-code.spec.ts — unit: the F3 exit-code mapping. Pure, plain Envelope in →
// number out → a spec.
import { test, expect } from 'bun:test'
import { exitCode } from './exit-code.js'
import type { Envelope } from '../envelope.js'

const err = (name: string): Envelope => ({ ok: false, command: 'x', error: { name, message: 'm' } })

test('success is 0', () => {
  expect(exitCode({ ok: true, command: 'x', result: null })).toBe(0)
})

test('usage / grammar misuse is 2', () => {
  expect(exitCode(err('UnknownTier'))).toBe(2)
  expect(exitCode(err('UnknownVerb'))).toBe(2)
  expect(exitCode(err('NoOp'))).toBe(2)
  expect(exitCode(err('BadSlug'))).toBe(2)
})

test('not-found is 3', () => {
  expect(exitCode(err('UnknownPhase'))).toBe(3)
  expect(exitCode(err('UnknownChild'))).toBe(3)
  expect(exitCode(err('DuplicateSlug'))).toBe(3)
})

test('a substrate guard / invariant is 4', () => {
  expect(exitCode(err('InvalidTransition'))).toBe(4)
  expect(exitCode(err('PhaseIncomplete'))).toBe(4)
  expect(exitCode(err('QuestionsOpen'))).toBe(4)
  expect(exitCode(err('AcNoReason'))).toBe(4)
  // a Zod schema-refine rejection (the evidence invariant) is also a guard refusal.
  expect(exitCode(err('ZodError'))).toBe(4)
})

test('an unknown error kind falls back to 1', () => {
  expect(exitCode(err('SomethingElse'))).toBe(1)
  expect(exitCode({ ok: false, command: 'x', error: { name: 'Error', message: 'm' } })).toBe(1)
})
