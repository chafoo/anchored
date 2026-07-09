import { describe, test, expect } from 'bun:test'
import { createConfig } from './config.js'
import type { AnchoredError } from '../../lib/utils/error.js'

describe('createConfig', () => {
  test('a missing anchored.yml means the built-in defaults ARE the behavior', () => {
    const config = createConfig(undefined)
    expect(config.fields()).toEqual({})
    expect(config.resolve()).toEqual({})
    expect(config.names()).toEqual([])
  })

  test('resolve() without a name returns the defaults', () => {
    const config = createConfig({
      defaults: { validator: { instructions: 'ground evidence' } },
    })
    expect(config.resolve().validator?.instructions).toBe('ground evidence')
  })

  test('resolve(name) flat-merges defaults + the named setup (setup key wins)', () => {
    const config = createConfig({
      defaults: {
        validator: { instructions: 'ground evidence' },
        after: { instructions: 'close-time hooks' },
      },
      setups: {
        backend: {
          validator: { instructions: 'real test runs only' },
          before: { instructions: 'run typecheck' },
        },
      },
    })
    const backend = config.resolve('backend')
    expect(backend.validator?.instructions).toBe('real test runs only') // setup wins the slot
    expect(backend.before?.instructions).toBe('run typecheck') // setup adds
    expect(backend.after?.instructions).toBe('close-time hooks') // defaults fill the gap
  })

  test('a setup writing its own instructions does not silently drop the defaults` require', () => {
    const config = createConfig({
      defaults: { validator: { instructions: 'ground evidence', require: 'grounded' } },
      setups: { backend: { validator: { instructions: 'real test runs only' } } },
    })
    const backend = config.resolve('backend')
    expect(backend.validator?.instructions).toBe('real test runs only') // setup wins the key
    expect(backend.validator?.require).toBe('grounded') // …but the hardening layer survives
  })

  test('a setup may harden on its own without any defaults', () => {
    const config = createConfig({
      setups: { release: { validator: { instructions: 'reject on doubt', require: 'grounded' } } },
    })
    expect(config.resolve('release').validator?.require).toBe('grounded')
    expect(config.resolve().validator).toBeUndefined() // defaults stay untouched
  })

  test('an unknown setup throws UnknownSetup and lists the declared names', () => {
    const config = createConfig({ setups: { frontend: {} } })
    try {
      config.resolve('backend')
      expect.unreachable()
    } catch (e) {
      expect((e as AnchoredError).kind).toBe('UnknownSetup')
      expect((e as AnchoredError).suggestions?.[0]).toContain('frontend')
    }
  })

  test('invalid config throws InvalidConfig with authoring suggestions', () => {
    try {
      createConfig({ setups: { backend: { steps: [] } } })
      expect.unreachable()
    } catch (e) {
      expect((e as AnchoredError).kind).toBe('InvalidConfig')
      expect((e as AnchoredError).suggestions?.length).toBeGreaterThan(0)
    }
  })

  test('fields() serves the declared custom fields', () => {
    const config = createConfig({ fields: { commit: 'string' } })
    expect(config.fields()).toEqual({ commit: 'string' })
  })
})
