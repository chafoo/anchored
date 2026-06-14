// store/validate/validate.ts — `anchored validate`: confirm the merged anchored.yml resolves
// across every tier×stage and report the resolved shape + declared custom fields.
// Bootstrap already parsed the Config schema, so an INVALID yml never reaches here
// (bin.ts catches the ConfigError and reports it). This command proves every step
// plan resolves and gives the user / setup-skill a readable summary of what their
// (possibly very large) yml actually expands to — the verifier the setup-skill runs
// as its final check.
import type { StepPlan } from '../../../domain/steps/plan.js'
import { STAGES } from '../../../domain/lifecycle/stages.js'

const TIERS = ['phase', 'task', 'epic'] as const

export interface TierReport {
  fields: string[]
  stages: Record<string, { name: string; kind: string }[]>
}
export interface ValidationReport {
  valid: true
  tiers: Record<string, TierReport>
}

export function createValidator(
  config: Record<string, { fields?: Record<string, unknown> } | undefined>,
  plan: (tier: string, stage: string) => StepPlan,
) {
  return {
    validate(): ValidationReport {
      const tiers: Record<string, TierReport> = {}
      for (const tier of TIERS) {
        const stages: Record<string, { name: string; kind: string }[]> = {}
        for (const stage of STAGES) {
          // plan() throws if a tier/stage step config is malformed — that surfaces
          // as the command's error envelope, which is exactly the validation signal.
          stages[stage] = plan(tier, stage).steps.map((s) => ({ name: s.name, kind: s.kind }))
        }
        tiers[tier] = { fields: Object.keys(config[tier]?.fields ?? {}), stages }
      }
      return { valid: true, tiers }
    },
  }
}
