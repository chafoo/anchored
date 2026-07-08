import { describe, test, expect } from 'bun:test'
import { okEnvelope, errEnvelope } from './envelope.js'
import { anchoredError } from '../lib/utils/error.js'

describe('envelope', () => {
  test('ok wraps command + result', () => {
    expect(okEnvelope('status', { slug: 'r1' })).toEqual({
      ok: true,
      command: 'status',
      result: { slug: 'r1' },
    })
  })

  test('an AnchoredError carries kind + suggestions through', () => {
    const env = errEnvelope('close', anchoredError('CloseBlocked', '2 unproven', ['c1 (open): x']))
    expect(env.ok).toBe(false)
    expect(env.error).toEqual({
      kind: 'CloseBlocked',
      message: '2 unproven',
      suggestions: ['c1 (open): x'],
    })
  })

  test('a zod rejection surfaces as SchemaViolation (the invariant speaking)', () => {
    const zodish = Object.assign(new Error('done requires validator evidence'), { issues: [] })
    expect(errEnvelope('evidence', zodish).error?.kind).toBe('SchemaViolation')
  })

  test('a plain error stays a plain error', () => {
    expect(errEnvelope('status', new Error('ENOENT')).error).toEqual({
      kind: 'Error',
      message: 'ENOENT',
    })
    expect(errEnvelope('status', 'boom').error?.message).toBe('boom')
  })
})
