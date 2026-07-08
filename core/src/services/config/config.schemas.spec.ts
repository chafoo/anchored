import { describe, test, expect } from 'bun:test'
import { AnchoredConfigSchema, SetupSchema } from './config.schemas.js'

describe('anchored.yml schema', () => {
  test('an empty config parses — the defaults ARE the behavior', () => {
    const cfg = AnchoredConfigSchema.parse({})
    expect(cfg.fields).toEqual({})
    expect(cfg.defaults).toEqual({})
    expect(cfg.setups).toEqual({})
  })

  test('a full config parses', () => {
    const cfg = AnchoredConfigSchema.parse({
      fields: { commit: 'string', coverage_pct: 'number' },
      defaults: { validator: { instructions: 'ground evidence' } },
      setups: {
        backend: {
          before: { instructions: 'run typecheck' },
          after: { instructions: 'commit + anchored set' },
        },
      },
    })
    expect(cfg.fields['commit']).toBe('string')
    expect(cfg.setups['backend']!.before?.instructions).toBe('run typecheck')
  })

  test('a field type outside string/number/boolean is rejected', () => {
    expect(() => AnchoredConfigSchema.parse({ fields: { commit: 'sha' } })).toThrow()
  })

  test('a setup with a step list is rejected — no workflow engine (strict)', () => {
    expect(() => SetupSchema.parse({ steps: [{ name: 'implement' }] })).toThrow()
    expect(() => SetupSchema.parse({ extends: 'backend' })).toThrow()
  })

  test('hooks are instruction blocks, not bare strings or command lists', () => {
    expect(() => SetupSchema.parse({ before: 'bun run lint' })).toThrow()
    expect(() => SetupSchema.parse({ before: { instructions: '' } })).toThrow()
    expect(() => SetupSchema.parse({ before: { command: 'bun run lint' } })).toThrow()
  })

  test('unknown top-level keys are rejected (strict)', () => {
    expect(() => AnchoredConfigSchema.parse({ plan_mode: 'auto' })).toThrow()
  })
})
