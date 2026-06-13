// config/bootstrap.ts — createBootstrap(deps): build the effectiveConfig once at
// startup, ready to inject as deps.config into every factory. All effects (reading
// the shipped default + the project's anchored.yml, parsing YAML) come through
// injected seams — no direct node:fs in the logic.
import { merge as realMerge } from './merge.js'
import { ConfigSchema, type Config } from '../schema/config/config.js'
import { anchoredError } from '../state/invariants/invariants.js'

export interface BootstrapDeps {
  /** Read the shipped default-template/anchored.default.yml (the reference). */
  readDefault: () => string
  /** Read <projectRoot>/anchored.yml, or undefined when it does not exist. */
  readUser: (projectRoot: string) => string | undefined
  parseYaml: (raw: string) => unknown
  /** The merge seam (default-template ⊕ user delta). Injectable for wiring tests. */
  merge?: (defaultCfg: Config, userCfg: Config) => Config
}

export function createBootstrap(deps: BootstrapDeps) {
  const merge = deps.merge ?? realMerge
  const validate = (parsed: unknown, label: string): Config => {
    // an empty or comments-only YAML document parses to null/undefined → that is a
    // valid zero-delta (use all defaults), NOT a config error
    const r = ConfigSchema.safeParse(parsed ?? {})
    if (!r.success) {
      throw anchoredError('ConfigError', `invalid ${label}: ${r.error.message}`, [
        `fix ${label} to match the anchored.yml schema`,
      ])
    }
    return r.data
  }
  const parseValidate = (raw: string, label: string): Config => validate(deps.parseYaml(raw), label)

  return {
    /** Load + validate default + user deltas, merged into the effective config. */
    load(projectRoot: string): Config {
      const defaultCfg = parseValidate(deps.readDefault(), 'default template')
      const userRaw = deps.readUser(projectRoot)
      // zero-config: a missing OR empty/comments-only anchored.yml ⇒ empty delta
      const userCfg =
        userRaw === undefined ? ({} as Config) : parseValidate(userRaw, 'anchored.yml')
      return merge(defaultCfg, userCfg)
    },

    /** Load + validate ONLY the shipped default template (the base side of merge). */
    defaultConfig(): Config {
      return parseValidate(deps.readDefault(), 'default template')
    },
  }
}
