// cli/commands/archive.ts — `anchored archive <slug> [--branch <name> …]`. Freezes a
// finished task OUT of the active set: MOVES its task-file into archive/ (substrate
// op, via the facade) and force-deletes its git branch(es) (the EFFECT, behind the
// injected `run` seam). WHICH branches is policy supplied by the caller (--branch);
// the default is `task/<slug>`. develop/main are NEVER targeted (protected refs).
import { cliError, type CliDeps } from '../index.js'
import { parseBranches, deleteBranches, requireNode } from './scope/lifecycle.js'

export async function archiveCommand(args: string[], deps: CliDeps): Promise<unknown> {
  const slug = args[0]
  if (slug === undefined) throw cliError('MissingArgument', 'missing argument: slug')

  const branches = parseBranches(args.slice(1), slug)
  // verify the node exists FIRST — a missing slug throws UnknownNode (no git, no file
  // touch). read() routes through the validating substrate; a raw read miss is mapped
  // to the typed lifecycle error.
  await requireNode(deps, slug)

  // delete the branch(es) best-effort (a branch may not exist → non-zero, tolerated).
  const { branchesDeleted, note } = await deleteBranches(deps.run, branches)

  const archived = (await deps.nodeOps.archive(slug)) as { to: string }
  return {
    slug,
    archived: true,
    branchesDeleted,
    to: archived.to,
    ...(note !== undefined ? { note } : {}),
  }
}
