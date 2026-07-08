import { test, expect } from 'bun:test'
import type { ConfigPort, SetupConfig } from './config.js'

// conformance: a canned ConfigPort satisfies the contract — flat merge, unknown throws.
test('a canned ConfigPort conforms', () => {
  const defaults: SetupConfig = { validator: { instructions: 'ground evidence' } }
  const setups: Record<string, SetupConfig> = {
    backend: { before: { instructions: 'run typecheck' } },
  }
  const config: ConfigPort = {
    fields: () => ({ commit: 'string' }),
    resolve: (name) => {
      if (name === undefined) return defaults
      const s = setups[name]
      if (!s) throw new Error(`unknown setup: ${name}`)
      return { ...defaults, ...s }
    },
    names: () => Object.keys(setups),
  }

  expect(config.fields()).toEqual({ commit: 'string' })
  expect(config.resolve()).toEqual(defaults)
  expect(config.resolve('backend').before?.instructions).toBe('run typecheck')
  expect(config.resolve('backend').validator?.instructions).toBe('ground evidence')
  expect(() => config.resolve('nope')).toThrow('unknown setup')
  expect(config.names()).toEqual(['backend'])
})
