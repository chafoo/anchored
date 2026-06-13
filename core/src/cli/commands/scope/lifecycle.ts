// cli/commands/scope/lifecycle.ts — pure helper shared by the archive + reset
// lifecycle commands. Both verbs are FILE-ONLY (they write exclusively to the
// task-files); deleting git branches is the user's own concern, not a framework
// side-effect. The only shared concern left is proving the node exists before any
// destructive file op — no hidden state, no imported effect.
import { cliError, type CliDeps } from '../../cli.js'

/** Read the node to prove it exists before the destructive file step (move/remove).
 *  A raw read miss (ENOENT) is mapped to a typed UnknownNode so the caller gets a
 *  clean error envelope, never a bare filesystem stack. */
export async function requireNode(deps: CliDeps, slug: string): Promise<void> {
  try {
    await deps.nodeOps.read(slug)
  } catch (e) {
    const err = e as { name?: string }
    // already a typed substrate error (e.g. UnknownNode) → keep it
    if (err.name && err.name !== 'Error') throw e
    throw cliError('UnknownNode', `no node '${slug}' to operate on`, [
      'check the slug — nothing was archived/reset',
    ])
  }
}
