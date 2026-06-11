// cli/commands/refine.ts — `anchored refine <slug>`. Loads the node via nodeOps,
// derives its tier, runs the engine once. runStage is the shared helper for the
// three slug-only stage verbs (refine/build/wrap).
import { cliError, type CliDeps } from '../index.js'

export async function runStage(stage: string, args: string[], deps: CliDeps): Promise<unknown> {
  const slug = args[0]
  if (slug === undefined) throw cliError('MissingArgument', 'missing argument: slug')
  const node = await deps.nodeOps.read(slug)
  const tier = deps.tierFor(node)
  const r = await deps.engine.run(tier, node)
  return {
    stage,
    tier,
    status: r.status,
    node: r.node,
    ...(r.evidence ? { evidence: r.evidence } : {}),
  }
}

export async function refineCommand(args: string[], deps: CliDeps): Promise<unknown> {
  return runStage('refine', args, deps)
}
