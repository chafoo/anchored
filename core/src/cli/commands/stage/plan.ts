// cli/commands/stage/plan.ts — `anchored plan <tier?> <input>`. With an explicit tier
// → engine.run(tier, ...) directly. WITHOUT a tier → classify-routing via the
// injected classify seam (NOT a content heuristic in the CLI), then proceed with
// the recommended tier. The TIER_KEYWORDS set only RECOGNISES an explicit tier
// argument (parsing) — classification is fully delegated. The slug derivation +
// classify tripwire domain helpers live in ./classify.ts (pulled out of the
// transport so cli.ts/plan.ts stay arg-parsing + dispatch only).
import { cliError, type CliDeps } from '../../cli.js'
import { slugFromInput } from './classify.js'

const TIER_KEYWORDS = new Set(['epic', 'task', 'phase'])

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
