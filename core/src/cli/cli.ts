// _v3/cli/cli.ts — createCli(deps) → Anchored. THE composition root: instantiate the two
// services (store · template) and the four tier factories (DI), and route. The api.md grammar
// is tier-first (`anchored <tier> <verb> [slug] …`), so dispatch is a DIRECT lookup
// `modules[tier].run(verb, rest)` — no slug→tier derivation. Meta-verbs (validate → template,
// help/version) are handled here. Emits exactly one JSON envelope per call; returns the exit
// code. No process access — bin.ts injects the real fs/lock/yaml/readers/out.
import type { Anchored } from '../lib/contracts/cli.js'
import type { Tier } from '../lib/contracts/tier.js'
import type { FileSystem, Lock, Yaml } from '../lib/contracts/fs.js'
import { anchoredError } from '../lib/utils/error.js'
import { createStore } from '../services/store/store.js'
import { createTemplate } from '../services/template/template.js'
import { createTask } from '../modules/task/task.js'
import { createPhase } from '../modules/phase/phase.js'
import { createEpic } from '../modules/epic/epic.js'
import { TaskNodeSchema } from '../modules/task/task.schemas.js'
import { envelope, type Envelope } from './envelope.js'

export interface CliDeps {
  fs: FileSystem
  lock: Lock
  yaml: Yaml
  /** the on-disk layout (POLICY) — tier-aware so a bare epic slug ≠ a bare standalone task. */
  pathFor: (slug: string, tier: string) => string
  archivePathFor: (slug: string, tier: string) => { from: string; to: string }
  rand: () => string
  pid: () => number
  readDefault: () => string
  readUser: (projectRoot: string) => string | undefined
  parseYaml: (raw: string) => unknown
  projectRoot: string
  out: (line: string) => void
  version?: string
}

function help(tiers: Record<string, Tier>): string {
  const lines = [
    'anchored — fractal task lifecycle (plan→refine→build→wrap), CLI-only.',
    '',
    'Usage: anchored <tier> <verb> [slug] [args]   ·   anchored validate | help | version',
    '',
  ]
  for (const [name, t] of Object.entries(tiers)) lines.push(`  ${name}: ${t.verbs().join(' · ')}`)
  return lines.join('\n')
}

export function createCli(deps: CliDeps): Anchored {
  // one store per TIER — its layout (pathFor/archive) is bound to that tier, so a bare epic slug
  // maps to its folder while a bare task slug maps to tasks/. phase reads task files → 'task'.
  const storeFor = (tier: string) =>
    createStore({
      fs: deps.fs,
      lock: deps.lock,
      yaml: deps.yaml,
      pathFor: (slug) => deps.pathFor(slug, tier),
      archivePathFor: (slug) => deps.archivePathFor(slug, tier),
      rand: deps.rand,
      pid: deps.pid,
    })
  const template = createTemplate({
    readDefault: deps.readDefault,
    readUser: deps.readUser,
    parseYaml: deps.parseYaml,
    projectRoot: deps.projectRoot,
  })
  const task = createTask({ store: storeFor('task'), template })
  const phase = createPhase({ store: storeFor('task'), taskSchema: TaskNodeSchema })
  const epic = createEpic({ store: storeFor('epic'), template, task })
  const tiers: Record<string, Tier> = { phase, task, epic }

  const emit = (env: Envelope): number => {
    deps.out(JSON.stringify(env))
    return env.ok ? 0 : 1
  }

  return {
    template,
    async run(argv: string[]): Promise<number> {
      const [tier, verb, ...rest] = argv
      if (tier === undefined || tier === 'help' || tier === '--help' || tier === '-h') {
        deps.out(help(tiers))
        return 0
      }
      if (tier === 'version' || tier === '--version' || tier === '-v') {
        deps.out(`anchored ${deps.version ?? '0.0.0'}`)
        return 0
      }
      if (tier === 'validate') {
        try {
          return emit(envelope('validate', template.validate()))
        } catch (e) {
          return emit(envelope('validate', undefined, e))
        }
      }
      const t = tiers[tier]
      if (!t) {
        return emit(
          envelope(
            tier,
            undefined,
            anchoredError('UnknownTier', `unknown tier '${tier}'`, [
              `tiers: ${Object.keys(tiers).join(', ')}`,
            ]),
          ),
        )
      }
      if (verb === undefined) {
        return emit(
          envelope(
            tier,
            undefined,
            anchoredError('NoVerb', `'${tier}' needs a verb`, [`verbs: ${t.verbs().join(', ')}`]),
          ),
        )
      }
      try {
        return emit(envelope(`${tier} ${verb}`, await t.run(verb, rest)))
      } catch (e) {
        return emit(envelope(`${tier} ${verb}`, undefined, e))
      }
    },
  }
}
