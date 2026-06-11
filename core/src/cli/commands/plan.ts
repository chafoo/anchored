// cli/commands/plan.ts — `anchored plan <tier?> <input>`. With an explicit tier
// → engine.run(tier, ...) directly. WITHOUT a tier → classify-routing via the
// injected classify seam (NOT a content heuristic in the CLI), then proceed with
// the recommended tier. The TIER_KEYWORDS set only RECOGNISES an explicit tier
// argument (parsing) — classification is fully delegated.
import { cliError, type CliDeps } from '../index.js'

const TIER_KEYWORDS = new Set(['epic', 'task', 'phase'])

function slugFromInput(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 48) || 'untitled'
  )
}

/** Deterministic classify tripwire: phase-count + (grey-zone) independence test
 *  → recommended tier. The AI judgement (independent?) comes from the spawn seam
 *  (fractal-redesign-notes Item 1: <5 task / 5–9 independence / ≥10 epic). */
export function classifyTier(phaseCount: number, independent?: boolean): 'task' | 'epic' {
  if (phaseCount < 5) return 'task'
  if (phaseCount >= 10) return 'epic'
  return independent ? 'epic' : 'task' // 5–9 grey zone: the independence test decides
}

export async function planCommand(args: string[], deps: CliDeps): Promise<unknown> {
  let tier: string
  let reasoning: string | undefined
  let input: string

  if (args[0] !== undefined && TIER_KEYWORDS.has(args[0])) {
    tier = args[0]
    input = args.slice(1).join(' ')
  } else {
    input = args.join(' ')
    if (!deps.classify) {
      throw cliError('NoTier', 'no tier given and classify is unavailable', [
        'pass an explicit tier: anchored plan <epic|task|phase> <input>',
      ])
    }
    const verdict = await deps.classify(input)
    tier = verdict.tier
    reasoning = verdict.reasoning
  }

  const node = await deps.nodeOps.create(slugFromInput(input), { title: input })
  // skill-orchestrated: return the node + the resolved plan-stage steps for the
  // in-session skill to execute (spawn discover/rules-scan/decompose). No engine
  // spawn here — the headless CLI can't reach the session's Task tool.
  const steps = deps.steps ? deps.steps(tier, 'plan').steps : []
  return { tier, ...(reasoning !== undefined ? { reasoning } : {}), node, steps }
}
