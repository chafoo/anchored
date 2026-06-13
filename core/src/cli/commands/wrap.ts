// cli/commands/wrap.ts — `anchored wrap <slug>`. Returns the orchestration plan
// for the wrap stage via the shared stage helper; the in-session SKILL executes
// it.
import { runStage } from './refine.js'
import type { CliDeps } from '../cli.js'

export async function wrapCommand(args: string[], deps: CliDeps): Promise<unknown> {
  return runStage('wrap', args, deps)
}
