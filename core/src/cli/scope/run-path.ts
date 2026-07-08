// cli/scope/run-path.ts — the ONE path layout: a run lives at
// <projectRoot>/.claude/anchored/<slug>.yml. Bound here (cli assembly), injected into the
// store — the store itself knows no layout.
import { join } from 'node:path'

export const RUNS_DIR = '.claude/anchored'

export function runsDir(projectRoot: string): string {
  return join(projectRoot, RUNS_DIR)
}

export function runPathFor(projectRoot: string): (slug: string) => string {
  return (slug) => join(runsDir(projectRoot), `${slug}.yml`)
}
