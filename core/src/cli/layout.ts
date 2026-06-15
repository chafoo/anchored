// _v3/cli/layout.ts — the on-disk layout (POLICY, in the cli/bin seam — the dumb store never
// knows it). `.claude/anchored/` keeps OPEN work and FINISHED work physically apart:
//
//   .claude/anchored/
//     <epic>/            one folder per open epic
//       _epic.yml        the epic node
//       <task>.yml       its task files
//     tasks/             open standalone tasks (not in any epic)
//       <task>.yml
//     _archive/
//       <epic>/          a finished epic — the whole folder moved here
//       tasks/<task>.yml finished standalone tasks
//
// A bare slug is ambiguous (epic vs. standalone task) — only the TIER resolves it, so the cli
// assembly binds the tier per store (`pathFor(slug, tier)`). A task slug with a `/` is a task
// inside an epic; a bare task slug is standalone.

export const ANCHORED_DIR = '.claude/anchored'

/** The node file for read/write. `tier` disambiguates a bare epic slug from a standalone task. */
export function pathFor(root: string, slug: string, tier: string): string {
  const base = `${root}/${ANCHORED_DIR}`
  if (tier === 'epic') return `${base}/${slug}/_epic.yml` // the epic folder
  // task (phase reads task files too): `<epic>/<task>` lives in the epic folder; a bare task is standalone.
  return slug.includes('/') ? `${base}/${slug}.yml` : `${base}/tasks/${slug}.yml`
}

/** The archive move pair {from → to}. An epic moves its whole FOLDER; a task moves its FILE. */
export function archivePathFor(
  root: string,
  slug: string,
  tier: string,
): { from: string; to: string } {
  const base = `${root}/${ANCHORED_DIR}`
  if (tier === 'epic') {
    return { from: `${base}/${slug}`, to: `${base}/_archive/${slug}` } // the whole epic folder
  }
  const rel = slug.includes('/') ? slug : `tasks/${slug}`
  return { from: `${base}/${rel}.yml`, to: `${base}/_archive/${rel}.yml` }
}
