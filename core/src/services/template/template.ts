// _v3/services/template/template.ts — createTemplate({readDefault,readUser,parseYaml,…}) →
// TemplatePort. The second service: merge the shipped default template ⊕ the user's
// anchored.yml ONCE, validate, and SERVE the steps + custom fields. The step order + the
// worker per step are DATA in the template — steps() is a trivial accessor. NO plan
// algorithm, no resolve-steps, no worker-dispatch.
import type { TemplatePort, StepPlan, Step } from '../../lib/contracts/template.js'
import { anchoredError } from '../../lib/utils/error.js'
import { ConfigSchema, type Config, tierNames } from './config.schemas.js'
import { STAGES } from './stages.js'
import { merge as realMerge } from './merge.js'

export interface TemplateDeps {
  /** read the shipped default template (anchored.default.yml). */
  readDefault: () => string
  /** read <projectRoot>/anchored.yml, or undefined when it does not exist. */
  readUser: (projectRoot: string) => string | undefined
  parseYaml: (raw: string) => unknown
  projectRoot: string
  merge?: (d: Config, u: Config) => Config
}

type TierBlock = Record<
  string,
  { steps?: Step[]; each?: string; stop?: string[]; retry_limit?: number }
>
type Merged = Record<string, TierBlock & { fields?: Record<string, unknown> }>

export function createTemplate(deps: TemplateDeps): TemplatePort {
  const merge = deps.merge ?? realMerge

  const validate = (parsed: unknown, label: string): Config => {
    // empty / comments-only YAML → null → a valid zero-delta (use all defaults).
    const r = ConfigSchema.safeParse(parsed ?? {})
    if (!r.success) {
      throw anchoredError('ConfigError', `invalid ${label}: ${r.error.message}`, [
        `fix ${label} to match the anchored.yml schema`,
      ])
    }
    return r.data
  }

  const defaultCfg = validate(deps.parseYaml(deps.readDefault()), 'default template')
  const userRaw = deps.readUser(deps.projectRoot)
  const userCfg =
    userRaw === undefined ? ({} as Config) : validate(deps.parseYaml(userRaw), 'anchored.yml')
  const merged = merge(defaultCfg, userCfg) as Merged

  return {
    steps(tier, stage): StepPlan {
      const block = merged[tier]?.[stage] ?? {}
      const plan: StepPlan = { tier, stage, steps: (block.steps ?? []) as Step[] }
      if (stage === 'build') {
        if (block.each !== undefined) plan.each = block.each
        if (block.stop !== undefined) plan.stop = block.stop
        if (block.retry_limit !== undefined) plan.retry_limit = block.retry_limit
      }
      return plan
    },

    fields(tier): Record<string, string> {
      const f = merged[tier]?.fields ?? {}
      // values are descriptive type-strings — coerce to string for the public shape.
      return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v)]))
    },

    validate(): unknown {
      // the config already parsed (createTemplate would have thrown) — report the resolved
      // shape: which stages each tier defines (so the host sees every tier×stage resolves).
      const tiers = Object.fromEntries(
        tierNames.map((t) => [t, STAGES.filter((s) => merged[t]?.[s] !== undefined)]),
      )
      const fields = Object.fromEntries(
        tierNames.map((t) => [t, Object.keys(merged[t]?.fields ?? {})]),
      )
      return { ok: true, tiers, fields }
    },

    raw(): Record<string, unknown> {
      return merged as Record<string, unknown>
    },
  }
}
