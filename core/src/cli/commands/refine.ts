// cli/commands/refine.ts — `anchored refine|build|wrap <slug>`. Returns the
// ORCHESTRATION PLAN for the stage (the node + the resolved, config-driven steps)
// for the in-session SKILL to execute. The CLI does NOT spawn agents here — a
// headless subprocess can't reach the session's Task tool, so spawning is the
// skill's job (skill-orchestrated runtime). The engine-drives-AI execution path
// was removed entirely (remove-headless-engine-path); there is no headless engine
// anymore. runStage is the shared helper for the three slug-only stage verbs
// (refine/build/wrap).
import { cliError, type CliDeps } from '../cli.js'

export async function runStage(stage: string, args: string[], deps: CliDeps): Promise<unknown> {
  const slug = args[0]
  if (slug === undefined) throw cliError('MissingArgument', 'missing argument: slug')
  const node = await deps.nodeOps.read(slug)
  const tier = deps.tierFor(node)
  const steps = deps.steps ? deps.steps(tier, stage).steps : []
  return { stage, tier, node, steps }
}

export async function refineCommand(args: string[], deps: CliDeps): Promise<unknown> {
  return runStage('refine', args, deps)
}
