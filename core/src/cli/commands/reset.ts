// cli/commands/reset.ts — `anchored reset <slug>`. Takes a task back to before it
// existed by REMOVING its task-file (substrate op, via the facade). FILE-ONLY: it
// never touches git — deleting any feature branch is the user's own concern, not a
// framework side-effect.
import { cliError, type CliDeps } from '../index.js'
import { requireNode } from './scope/lifecycle.js'

export async function resetCommand(args: string[], deps: CliDeps): Promise<unknown> {
  const slug = args[0]
  if (slug === undefined) throw cliError('MissingArgument', 'missing argument: slug')

  // verify the node exists FIRST — UnknownNode (no file delete) on a bad slug.
  await requireNode(deps, slug)

  await deps.nodeOps.reset(slug)
  return { slug, reset: true }
}
