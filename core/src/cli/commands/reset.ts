// cli/commands/reset.ts — `anchored reset <slug> [--branch <name> …]`. Takes a task
// back to before it existed: REMOVES its task-file (substrate op, via the facade) and
// force-deletes its git branch(es) (the EFFECT, behind the injected `run` seam).
// Like archive, the default branch is `task/<slug>`; develop/main are NEVER targeted
// (reset rewinds nothing — it only deletes the named feature branches).
import { cliError, type CliDeps } from '../index.js'
import { parseBranches, deleteBranches, requireNode } from './scope/lifecycle.js'

export async function resetCommand(args: string[], deps: CliDeps): Promise<unknown> {
  const slug = args[0]
  if (slug === undefined) throw cliError('MissingArgument', 'missing argument: slug')

  const branches = parseBranches(args.slice(1), slug)
  // verify the node exists FIRST — UnknownNode (no git, no file delete) on a bad slug.
  await requireNode(deps, slug)

  const { branchesDeleted, note } = await deleteBranches(deps.run, branches)

  await deps.nodeOps.reset(slug)
  return {
    slug,
    reset: true,
    branchesDeleted,
    ...(note !== undefined ? { note } : {}),
  }
}
