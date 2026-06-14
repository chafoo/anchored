// domain/steps/resolve-steps/resolve-steps.ts — insert built-in defaults + normalise order,
// config-driven (no hardcoded DOMAIN step names; 'loop'/'run' are structural
// built-ins). The build:{each} shorthand expands to a positioned loop step with
// the implicit body [run] (Item 5a).
import type { Step } from '../step.js'

export interface StageCfg {
  steps?: Step[]
  each?: Step['each']
}

export function resolveSteps(stageCfg: StageCfg | undefined, opts?: { defaults?: Step[] }): Step[] {
  const cfg = stageCfg ?? {}
  // shorthand `build: { each: task }` → a single positioned loop step
  if (cfg.each !== undefined && cfg.steps === undefined) {
    return [{ name: 'loop', each: cfg.each, steps: [{ name: 'run' }] }]
  }
  const steps = cfg.steps ?? opts?.defaults ?? []
  // a loop step without an explicit body gets the implicit [run] body
  return steps.map((s) =>
    s.each !== undefined && (s.steps === undefined || s.steps.length === 0)
      ? { ...s, steps: [{ name: 'run' }] }
      : s,
  )
}

/** Resolve the effective, ordered steps for a tier/stage from the (merged)
 *  effectiveConfig. Defaults are already merged in by config/merge; this normalises
 *  the each-shorthand + order. Pure + deterministic. */
export function createResolveSteps(cfg: Record<string, unknown>) {
  return {
    resolve(tier: string, stage: string): Step[] {
      const tierBlock = cfg[tier] as Record<string, StageCfg | undefined> | undefined
      return resolveSteps(tierBlock?.[stage])
    },
  }
}
