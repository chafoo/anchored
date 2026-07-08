// services/config/config.fake.ts — a canned ConfigPort double for the run-module spec
// (keeps the unit isolated from the real config module). Build-excluded test-support.
import type { ConfigPort, FieldsConfig, SetupConfig } from '../../lib/contracts/config.js'
import { anchoredError } from '../../lib/utils/error.js'

export interface FakeConfigSeed {
  fields?: FieldsConfig
  defaults?: SetupConfig
  setups?: Record<string, SetupConfig>
}

export function createFakeConfig(seed: FakeConfigSeed = {}): ConfigPort {
  const fields = seed.fields ?? {}
  const defaults = seed.defaults ?? {}
  const setups = seed.setups ?? {}
  return {
    fields: () => fields,
    resolve(setup?: string): SetupConfig {
      if (setup === undefined) return defaults
      const named = setups[setup]
      if (named === undefined) throw anchoredError('UnknownSetup', `no setup '${setup}'`)
      return { ...defaults, ...named }
    },
    names: () => Object.keys(setups),
  }
}
