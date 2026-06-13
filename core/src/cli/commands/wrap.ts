// cli/commands/wrap.ts — `anchored wrap <slug>`. Drives the engine via the shared
// stage helper.
import { runStage } from './refine.js'
import type { CliDeps } from '../cli.js'

export async function wrapCommand(args: string[], deps: CliDeps): Promise<unknown> {
  return runStage('wrap', args, deps)
}
