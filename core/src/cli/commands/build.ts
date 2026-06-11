// cli/commands/build.ts — `anchored build <slug>`. Drives the engine via the
// shared stage helper.
import { runStage } from './refine.js'
import type { CliDeps } from '../index.js'

export async function buildCommand(args: string[], deps: CliDeps): Promise<unknown> {
  return runStage('build', args, deps)
}
