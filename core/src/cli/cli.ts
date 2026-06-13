// cli/cli.ts — createCli(deps) → { run(argv) → exitCode }. Pure factory: no
// process access (that lives only in the bin entry, src/index.ts). Every call
// emits exactly ONE JSON envelope to deps.out — { ok, command, result|error } —
// machine-parseable for skills + agents (cli-only-transport). Errors are caught
// centrally and serialised (no stacktrace leak, no crash).
import { nodeCommand } from './commands/node/node.js'
import { planCommand } from './commands/plan/plan.js'
import { refineCommand } from './commands/refine.js'
import { buildCommand } from './commands/build.js'
import { wrapCommand } from './commands/wrap.js'
import { stepsCommand, type StepPlan } from './commands/steps.js'
import { archiveCommand } from './commands/archive.js'
import { resetCommand } from './commands/reset.js'

export interface NodeOpsFacade {
  create(slug: string, init: Record<string, unknown>): Promise<unknown>
  read(slug: string): Promise<unknown>
  setStatus(slug: string, status: string): Promise<unknown>
  addChild(
    slug: string,
    child: { slug: string; goal?: string; depends_on?: string[] },
  ): Promise<unknown>
  setChildField(slug: string, childSlug: string, field: string, value: unknown): Promise<unknown>
  nextChild(slug: string): Promise<unknown>
  readyChildren(slug: string): Promise<unknown>
  addQuestion(slug: string, q: { text: string; priority: string }): Promise<unknown>
  resolveQuestion(
    slug: string,
    id: string,
    r: { answer: string; source: string; reasoning?: string },
  ): Promise<unknown>
  addConcern(slug: string, q: { text: string; priority: string }): Promise<unknown>
  resolveConcern(
    slug: string,
    id: string,
    r: { answer: string; source: string; reasoning?: string },
  ): Promise<unknown>
  appendLog(slug: string, e: { at: string; kind: string; note: string }): Promise<unknown>
  setField(slug: string, field: string, value: string): Promise<unknown>
  setExecutor(slug: string, phase: string, value: string): Promise<unknown>
  addEvidence(slug: string, acId: string, text: string): Promise<unknown>
  addPhase(slug: string, phase: { slug: string; name?: string }): Promise<unknown>
  addAc(slug: string, phase: string, ac: { id?: string; text: string }): Promise<unknown>
  addAcceptance(slug: string, text: string): Promise<unknown>
  setAcceptanceStatus(
    slug: string,
    id: string,
    status: string,
    evidence?: string[],
  ): Promise<unknown>
  addChildEvidence(slug: string, phase: string, acId: string, text: string): Promise<unknown>
  setChildFailures(slug: string, phase: string, acId: string, text: string): Promise<unknown>
  setChildAcStatus(slug: string, phase: string, acId: string, status: string): Promise<unknown>
  clearChildFailures(slug: string, phase: string, acId: string): Promise<unknown>
  setPhaseRules(slug: string, phase: string, path: string, why: string): Promise<unknown>
  setChildStatus(slug: string, childSlug: string, status: string): Promise<unknown>
  // Lifecycle ops: archive MOVES the task-file into archive/ (freeze it out of the
  // active set), reset REMOVES it (back to before the task existed). File-only — the
  // archive/reset CLI commands write exclusively to the task-files (no git).
  archive(slug: string): Promise<unknown>
  reset(slug: string): Promise<unknown>
}

export interface CliDeps {
  nodeOps: NodeOpsFacade
  tierFor: (node: unknown) => string
  classify?: (input: string) => Promise<{ tier: string; reasoning?: string }>
  steps?: (tier: string, stage: string) => StepPlan
  // D1: `anchored validate` — report the resolved shape across every tier×stage.
  validate?: () => unknown
  // L1a (harden-3): a real shell runner, used by `add-phase-evidence --run` to
  // EXECUTE a gate command, capture its exit code, and accept the evidence only on
  // exit 0 — the deterministic evidence-honesty floor (the agent can't fake it).
  run?: (cmd: string) => Promise<{ code: number; stdout: string; stderr: string }>
  out: (line: string) => void
  // F5: the real package version, injected from bin.ts (the only fs-touching site).
  // Falls back to the constant when not wired (tests).
  version?: string
}

/** Typed CLI error → serialised into the error envelope. */
export function cliError(name: string, message: string, suggestions?: string[]): Error {
  const e = new Error(message) as Error & { suggestions?: string[] }
  e.name = name
  if (suggestions) e.suggestions = suggestions
  return e
}

function emit(
  deps: CliDeps,
  ok: boolean,
  command: string,
  result?: unknown,
  error?: unknown,
): number {
  const env: Record<string, unknown> = { ok, command }
  if (ok) env.result = result ?? null
  else env.error = error
  deps.out(JSON.stringify(env))
  return ok ? 0 : 1
}

const VERSION = '0.0.0'
const HELP = `anchored — fractal task lifecycle (plan→refine→build→wrap), CLI-only.

Usage: anchored <command> [args]

Stage commands (return the orchestration plan for the in-session skill):
  plan [epic|task|phase] [--slug <slug>] <description>   create a node + plan-stage steps
  refine <slug>                          refine-stage plan (plan-check, rules-check, walk)
  build  <slug>                          build-stage plan (loop / implement + gates)
  wrap   <slug>                          wrap-stage plan (review/summarize | roll-up)
  steps  <tier> <stage>                  resolved step plan for a tier/stage
  validate                               check the merged anchored.yml: resolves every tier×stage + lists custom fields

Node ops (agents self-write via these):
  node read <slug>
  node set-status <slug> <status>            node add-question <slug> <text> [priority]
  node add-phase <slug> <phase> <name>       node resolve-question <slug> <id> <answer> [src]
  node add-ac <slug> <phase> <text>          node append-log <slug> <at> <kind> <note>
  node add-phase-evidence <slug> <phase> <ac> <text>
  node set-child-status <slug> <child> <status>
  node add-child <slug> <child> [goal] [deps-csv]   node next-child <slug>
  node set-child-field <slug> <child> <field> <value>
  node set-field <slug> <field> <value>      node set-executor <slug> <phase> <implement|workflow>

Lifecycle ops (clean up a finished/abandoned task — file-only, no git):
  archive <slug>                         freeze: move the task-file to archive/<slug>.yml (file-only, no git)
  reset   <slug>                         undo: remove the task-file (file-only, no git)

  -h, --help        show this help
  -v, --version     print the version

All commands emit a JSON envelope { ok, command, result|error }. No MCP.`

export function createCli(deps: CliDeps) {
  return {
    async run(argv: string[]): Promise<number> {
      const verb = argv[0] ?? ''
      const rest = argv.slice(1)
      if (verb === 'help' || verb === '--help' || verb === '-h' || verb === '') {
        deps.out(HELP)
        return 0
      }
      if (verb === 'version' || verb === '--version' || verb === '-v') {
        deps.out(`anchored ${deps.version ?? VERSION}`)
        return 0
      }
      try {
        let result: unknown
        switch (verb) {
          case 'node':
            result = await nodeCommand(rest, deps)
            break
          case 'plan':
            result = await planCommand(rest, deps)
            break
          case 'refine':
            result = await refineCommand(rest, deps)
            break
          case 'build':
            result = await buildCommand(rest, deps)
            break
          case 'wrap':
            result = await wrapCommand(rest, deps)
            break
          case 'steps':
            result = await stepsCommand(rest, deps)
            break
          case 'archive':
            result = await archiveCommand(rest, deps)
            break
          case 'reset':
            result = await resetCommand(rest, deps)
            break
          case 'validate':
            // the merged yml already parsed (createAnchored would have thrown
            // otherwise); report the resolved shape across every tier×stage.
            if (!deps.validate)
              throw cliError('Unsupported', 'validate is not wired in this CLI build')
            result = deps.validate()
            break
          default:
            return emit(deps, false, verb, undefined, {
              name: 'UnknownCommand',
              message: `unknown command '${verb}'`,
              suggestions: [
                'plan',
                'refine',
                'build',
                'wrap',
                'validate',
                'steps',
                'node',
                'archive',
                'reset',
              ],
            })
        }
        return emit(deps, true, verb, result)
      } catch (e) {
        const err = e as { name?: string; message?: string; suggestions?: string[] }
        return emit(deps, false, verb, undefined, {
          name: err.name ?? 'Error',
          message: err.message ?? String(e),
          ...(err.suggestions ? { suggestions: err.suggestions } : {}),
        })
      }
    },
  }
}
