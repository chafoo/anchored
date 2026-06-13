// cli/commands/stage/steps.ts — `anchored steps <tier> <stage>`. Returns the resolved,
// config-driven step PLAN for a tier/stage as JSON — the orchestration menu the
// skills consult: which workers (→ which plugin agent) to spawn in-session, in
// what order, plus the loop edge + stop/retry for a looping build. The skill is
// the orchestrator (it has the plugin + agents loaded); the CLI stays the
// deterministic planner + ops. No spawning happens here.
import { cliError, type CliDeps } from '../../cli.js'
import type { PlanStep, StepPlan } from '../../../domain/steps/plan.js'

export type { PlanStep, StepPlan }

export async function stepsCommand(args: string[], deps: CliDeps): Promise<unknown> {
  const tier = args[0]
  const stage = args[1]
  if (tier === undefined) throw cliError('MissingArgument', 'missing argument: tier')
  if (stage === undefined) throw cliError('MissingArgument', 'missing argument: stage')
  if (!deps.steps) {
    throw cliError('Unsupported', 'steps planner is not wired in this CLI build')
  }
  return deps.steps(tier, stage)
}
