// cli/commands/plan/plan.ts — `anchored plan <tier?> <input>`. With an explicit tier
// → engine.run(tier, ...) directly. WITHOUT a tier → classify-routing via the
// injected classify seam (NOT a content heuristic in the CLI), then proceed with
// the recommended tier. The TIER_KEYWORDS set only RECOGNISES an explicit tier
// argument (parsing) — classification is fully delegated.
import { cliError, type CliDeps } from '../../cli.js'

const TIER_KEYWORDS = new Set(['epic', 'task', 'phase'])

function slugFromInput(input: string): string {
  // slice FIRST, then strip leading/trailing dashes — the cut can land mid-word and
  // leave a trailing dash, which the kebab-slug regex rejects (F14).
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 48)
      .replace(/(^-|-$)/g, '') || 'untitled'
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

  // F3: an explicit `--slug <value>` (or --slug=value) overrides the slug derived
  // from the description — so `anchored plan epic --slug tasks-app "<long desc>"`
  // gives a clean slug instead of slugifying the whole prose (the dogfood pain that
  // forced repeated rm+recreate). Strip it from args before tier/input parsing.
  let explicitSlug: string | undefined
  const stripped: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--slug') {
      explicitSlug = args[++i]
    } else if (arg.startsWith('--slug=')) {
      explicitSlug = arg.slice('--slug='.length)
    } else {
      stripped.push(arg)
    }
  }
  args = stripped

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

  // pass the explicit tier so create seeds the right shape (epic → tasks:[], status
  // plan); without it create would default to a task-shaped node (F13).
  const slug = explicitSlug ? slugFromInput(explicitSlug) : slugFromInput(input)
  const node = await deps.nodeOps.create(slug, { title: input, tier })
  // skill-orchestrated: return the node + the resolved plan-stage steps for the
  // in-session skill to execute (spawn discover/rules-scan/decompose). No engine
  // spawn here — the headless CLI can't reach the session's Task tool.
  const steps = deps.steps ? deps.steps(tier, 'plan').steps : []
  return { tier, ...(reasoning !== undefined ? { reasoning } : {}), node, steps }
}
