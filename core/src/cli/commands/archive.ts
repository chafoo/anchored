// cli/commands/archive.ts — `anchored archive <slug>`. Freezes a finished task OUT of
// the active set by MOVING its task-file into archive/ (substrate op, via the facade).
// FILE-ONLY: it never touches git — deleting any feature branch is the user's own
// concern, not a framework side-effect.
import { cliError, type CliDeps } from '../index.js'
import { requireNode } from './scope/lifecycle.js'

export async function archiveCommand(args: string[], deps: CliDeps): Promise<unknown> {
  const slug = args[0]
  if (slug === undefined) throw cliError('MissingArgument', 'missing argument: slug')

  // verify the node exists FIRST — a missing slug throws UnknownNode (no file touch).
  // read() routes through the validating substrate; a raw read miss is mapped to the
  // typed lifecycle error.
  await requireNode(deps, slug)

  const archived = (await deps.nodeOps.archive(slug)) as { to: string }
  return { slug, archived: true, to: archived.to }
}
