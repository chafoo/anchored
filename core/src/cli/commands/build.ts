// cli/commands/build.ts — `anchored build <slug>`. Returns the orchestration
// plan for the build stage via the shared stage helper; the in-session SKILL
// executes it.
import { runStage } from './refine.js'
import type { CliDeps } from '../cli.js'

export async function buildCommand(args: string[], deps: CliDeps): Promise<unknown> {
  return runStage('build', args, deps)
}
