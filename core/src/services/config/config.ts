// services/config/config.ts — createConfig(raw) → ConfigPort. A PURE factory over the
// already-read anchored.yml data (the cli assembly does the fs read + yaml parse — the
// effect stays at the seam). Missing file (undefined) ⇒ the built-in defaults ARE the
// behavior. resolve(setup) = flat merge of defaults + the named setup; unknown → loud error.
import type { ConfigPort, SetupConfig } from '../../lib/contracts/config.js'
import { anchoredError } from '../../lib/utils/error.js'
import { AnchoredConfigSchema, type AnchoredConfig } from './config.schemas.js'

export function createConfig(raw?: unknown): ConfigPort {
  let cfg: AnchoredConfig
  try {
    cfg = AnchoredConfigSchema.parse(raw ?? {})
  } catch (e) {
    throw anchoredError('InvalidConfig', `anchored.yml is invalid: ${(e as Error).message}`, [
      'a setup is exactly { validator, before, after } instruction blocks',
      'custom fields are `name: string|number|boolean` under top-level `fields`',
    ])
  }

  return {
    fields: () => cfg.fields,

    resolve(setup?: string): SetupConfig {
      if (setup === undefined) return cfg.defaults
      const named = cfg.setups[setup]
      if (named === undefined)
        throw anchoredError('UnknownSetup', `no setup '${setup}' in anchored.yml`, [
          Object.keys(cfg.setups).length > 0
            ? `declared setups: ${Object.keys(cfg.setups).join(', ')}`
            : 'no setups declared — omit the setup to use defaults, or add one via /a:setup',
        ])
      // before/after replace wholesale — one instruction, one author. The validator slot
      // merges FIELD-wise: a setup that writes its own `instructions` must not silently
      // drop a `require: grounded` the defaults established. Hardening layers, it does not
      // get shadowed by a sibling key.
      const validator =
        cfg.defaults.validator !== undefined || named.validator !== undefined
          ? { ...cfg.defaults.validator, ...named.validator }
          : undefined
      return {
        ...cfg.defaults,
        ...named,
        ...(validator !== undefined ? { validator } : {}),
      } as SetupConfig
    },

    names: () => Object.keys(cfg.setups),
  }
}
