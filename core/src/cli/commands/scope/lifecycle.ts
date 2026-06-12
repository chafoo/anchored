// cli/commands/scope/lifecycle.ts — pure helpers shared by the archive + reset
// lifecycle commands: parse the repeated `--branch` flag into a branch list, and
// issue best-effort `git branch -D` for each. No hidden state, no imported effect —
// the git runner arrives as a parameter (the injected `run` seam), so these stay
// fakeable + the deterministic-ban-friendly. develop/main are NEVER targeted.
import { cliError, type CliDeps } from '../../index.js'

/** Read the node to prove it exists before any destructive step (git/file). A raw
 *  read miss (ENOENT) is mapped to a typed UnknownNode so the caller gets a clean
 *  error envelope, never a bare filesystem stack. */
export async function requireNode(deps: CliDeps, slug: string): Promise<void> {
  try {
    await deps.nodeOps.read(slug)
  } catch (e) {
    const err = e as { name?: string }
    // already a typed substrate error (e.g. UnknownNode) → keep it
    if (err.name && err.name !== 'Error') throw e
    throw cliError('UnknownNode', `no node '${slug}' to operate on`, [
      'check the slug — nothing was archived/reset and no branch was deleted',
    ])
  }
}

/** Refs that must never be force-deleted, no matter what the caller passes. */
const PROTECTED = new Set(['develop', 'main'])

type Run = (cmd: string) => Promise<{ code: number; stdout: string; stderr: string }>

/** Parse repeated `--branch <name>` flags. With none given, default to `task/<slug>`.
 *  Protected refs (develop/main) are filtered out — they are never deletion targets. */
export function parseBranches(args: string[], slug: string): string[] {
  const explicit: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--branch') {
      const name = args[++i]
      if (name !== undefined) explicit.push(name)
    } else if (arg.startsWith('--branch=')) {
      explicit.push(arg.slice('--branch='.length))
    }
  }
  const list = explicit.length > 0 ? explicit : [`task/${slug}`]
  return list.filter((b) => !PROTECTED.has(b))
}

/** Best-effort force-delete each branch via the injected runner. A non-zero exit
 *  (branch may not exist) is TOLERATED — the branch is reported as "deleted" intent
 *  regardless. When no runner is wired, git is skipped and a note explains why. */
export async function deleteBranches(
  run: Run | undefined,
  branches: string[],
): Promise<{ branchesDeleted: string[]; note?: string }> {
  if (!run) {
    return { branchesDeleted: [], note: 'git unavailable (no run seam) — branches not deleted' }
  }
  for (const b of branches) {
    // tolerate non-zero (absent branch): we asked git to delete it, that's enough.
    await run(`git branch -D ${b}`)
  }
  return { branchesDeleted: branches }
}
