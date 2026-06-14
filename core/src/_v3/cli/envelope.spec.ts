import { test, expect } from 'bun:test'
import { envelope } from './envelope.js'
import { anchoredError } from '../lib/utils/error.js'

test('an ok envelope wraps the result (null by default)', () => {
  expect(envelope('task get', { slug: 't' })).toEqual({
    ok: true,
    command: 'task get',
    result: { slug: 't' },
  })
  expect(envelope('x').result).toBeNull()
})

test('an error envelope flattens an AnchoredError (kind → name, + suggestions)', () => {
  const e = anchoredError('WriteContention', 'boom', ['retry'])
  expect(envelope('task status', undefined, e)).toEqual({
    ok: false,
    command: 'task status',
    error: { name: 'WriteContention', message: 'boom', suggestions: ['retry'] },
  })
})
