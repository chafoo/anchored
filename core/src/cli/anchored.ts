// cli/anchored.ts — the ORCHESTRATOR. createAnchored(deps) is the single composition
// root: it bootstraps the merged config ONCE, collects the tier condition bundles,
// builds the substrate (codec/render/io → store) in deps-graph order, injects the
// conditions into the generic store, wires the slug-facade + the cli dispatch, and
// returns the live object graph { cli, ops, config }. This is the ONE place modules
// (pure conditions) and services (generic mechanism) meet — by dependency injection.
// No top-level side-effect, no process access (that lives only in src/bin.ts); every
// effect (fs, yaml, merge) arrives through an injected seam, so the graph is fakeable.
import { z } from 'zod'
import { parse, stringify } from 'yaml'
import { createCli, type CliDeps, type NodeOpsFacade } from './cli.js'
import {
  createNodeOps,
  type TierDescriptor,
  type NodeOpsDeps,
} from '../services/store/node-store/node-store.js'
import { createSlugFacade, type TierOps } from './node-router/node-router.js'
import { tierOfNode, makeTierFor } from './tier-of/tier-of.js'
import { createStepsPlanner } from '../services/config/plan-for.js'
import { createValidator } from '../services/store/validate/validate.js'
import { createParser } from '../services/store/codec/parse/parse.js'
import { createRenderer, defaultSchemaUrl } from '../services/store/codec/render/render.js'
import { createIo, type IoDeps } from '../services/store/io/io.js'
import { createBootstrap } from '../services/config/bootstrap.js'
import { phase, PhaseNodeSchema } from '../modules/phase/phase.js'
import { task, TaskNodeSchema } from '../modules/task/task.js'
import { epic, EpicNodeSchema } from '../modules/epic/epic.js'
import { project, ProjectNodeSchema } from '../modules/project/project.js'
import { ConfigSchema, type Config } from '../services/config/config-schema/config.js'
import { extendSchemaWithFields } from '../services/config/config-schema/custom-fields.js'

export { tierOfNode }

// the condition bundles — each a pure `modules/<tier>` export, collected here at the
// orchestrator and injected into the generic store (the one place modules + services
// meet). DEFAULT_STATUS is derived from the bundles (no separate hardcoded map).
const CONDITIONS: Record<string, TierDescriptor> = { phase, task, epic, project }
const DEFAULT_STATUS: Record<string, string> = Object.fromEntries(
  Object.values(CONDITIONS).map((c) => [c.tier, c.defaultStatus]),
)

// ── shared substrate builder (parser + renderer + io + per-tier node-ops) ──
interface Substrate {
  opsFor: (tier: string) => TierOps
  opsByTier: Record<string, TierOps>
}

function buildSubstrate(
  io: ReturnType<typeof createIo>,
  pathFor: (slug: string) => string,
  createNodeOpsFn: typeof createNodeOps,
  // config-declared custom fields per tier (e.g. `task.fields.commit_sha`). When
  // present, the tier schema is extended so a declared custom field validates on
  // both read (parser) and write (persist). Absent (test harness) → strict base.
  fieldsByTier?: Record<string, Record<string, unknown> | undefined>,
): Substrate {
  const taskSchema = extendSchemaWithFields(TaskNodeSchema, fieldsByTier?.task)
  const epicSchema = extendSchemaWithFields(EpicNodeSchema, fieldsByTier?.epic)
  const phaseSchema = extendSchemaWithFields(PhaseNodeSchema, fieldsByTier?.phase)
  const projectSchema = extendSchemaWithFields(ProjectNodeSchema, fieldsByTier?.project)
  const parser = createParser({
    yaml: { parse },
    schemas: {
      task: taskSchema,
      epic: epicSchema,
      phase: phaseSchema,
      project: projectSchema,
      config: ConfigSchema,
    },
  })
  const renderer = createRenderer({ yaml: { stringify }, schemaUrl: defaultSchemaUrl })
  const opsDepsFor = (tier: string): NodeOpsDeps => ({
    io,
    render: (node) => renderer.renderNodeYAML(node, { tier }),
    parse: (raw) => parser.parseNodeYAML(raw, { profile: 'task-file', tier }),
    pathFor,
  })
  // descriptors carry the EXTENDED schema so persist (G1) accepts declared customs.
  const schemaByTier: Record<string, z.ZodType> = {
    phase: phaseSchema,
    task: taskSchema,
    epic: epicSchema,
    project: projectSchema,
  }
  const descFor = (tier: string): TierDescriptor => ({
    ...CONDITIONS[tier]!,
    schema: schemaByTier[tier]!,
  })
  const opsByTier: Record<string, TierOps> = Object.fromEntries(
    Object.keys(CONDITIONS).map((tier) => [
      tier,
      createNodeOpsFn(descFor(tier), opsDepsFor(tier)) as unknown as TierOps,
    ]),
  )
  return { opsByTier, opsFor: (tier) => opsByTier[tier] ?? opsByTier.task! }
}

// ── buildCli: the slug-facade + cli wiring used by the e2e harness ──
export interface WireDeps {
  io: IoDeps
  pathFor: (slug: string) => string
  out: (line: string) => void
  tierForSlug?: (slug: string) => string
  classify?: CliDeps['classify']
  now?: () => string
  // optional shell runner — lifecycle ops (archive/reset) issue git branch -D through it.
  run?: CliDeps['run']
}

export function buildCli(w: WireDeps) {
  const io = createIo(w.io)
  const { opsFor } = buildSubstrate(io, w.pathFor, createNodeOps)
  const facade = createSlugFacade({
    opsFor,
    tierFor: makeTierFor(io, w.pathFor),
    defaultStatus: DEFAULT_STATUS,
    now: w.now,
    pathFor: w.pathFor,
    io,
  })
  return createCli({
    nodeOps: facade,
    tierFor: tierOfNode,
    classify: w.classify,
    ...(w.run !== undefined ? { run: w.run } : {}),
    out: w.out,
  })
}

// ── createAnchored: the full object graph (config + ops + cli) ──
export interface AnchoredWiring {
  merge?: (defaultCfg: Config, userCfg: Config) => Config
  createNodeOps?: typeof createNodeOps
  createCli?: typeof createCli
}

export interface AnchoredDeps {
  projectRoot: string
  io: IoDeps
  readDefault: () => string
  readUser: (projectRoot: string) => string | undefined
  parseYaml: (raw: string) => unknown
  out: (line: string) => void
  pathFor?: (slug: string) => string
  tierForSlug?: (slug: string) => string
  run?: (cmd: string) => Promise<{ code: number; stdout: string; stderr: string }>
  classify?: CliDeps['classify']
  now?: () => string
  version?: string
  wiring?: AnchoredWiring
}

export interface Anchored {
  cli: ReturnType<typeof createCli>
  ops: NodeOpsFacade
  config: Config
}

export function createAnchored(deps: AnchoredDeps): Anchored {
  const wiring = deps.wiring ?? {}
  const createNodeOpsFn = wiring.createNodeOps ?? createNodeOps
  const createCliFn = wiring.createCli ?? createCli

  // substrate seams
  const io = createIo(deps.io)
  const pathFor =
    deps.pathFor ?? ((slug: string) => `${deps.projectRoot}/.claude/tasks/${slug}.yml`)

  // config: merge default-template ⊕ user delta EXACTLY ONCE (base dependency)
  const bootstrap = createBootstrap({
    readDefault: deps.readDefault,
    readUser: deps.readUser,
    parseYaml: deps.parseYaml,
    merge: wiring.merge,
  })
  const config = bootstrap.load(deps.projectRoot)

  // ops — built BEFORE the engine (deps-graph order: substrate → ops → engine → cli).
  // Thread the config-declared custom fields per tier into the substrate so a
  // declared `task.fields.<x>` validates on read + write (G1 stays strict otherwise).
  const cfgRec = config as unknown as Record<string, { fields?: Record<string, unknown> }>
  const fieldsByTier = {
    task: cfgRec.task?.fields,
    epic: cfgRec.epic?.fields,
    phase: cfgRec.phase?.fields,
    project: cfgRec.project?.fields,
  }
  const { opsFor } = buildSubstrate(io, pathFor, createNodeOpsFn, fieldsByTier)
  const facade = createSlugFacade({
    opsFor,
    tierFor: makeTierFor(io, pathFor),
    defaultStatus: DEFAULT_STATUS,
    now: deps.now,
    pathFor,
    io,
  })

  // cli — the single transport, fed the ops from the previous stage. The steps
  // planner gives the in-session skills their config-driven orchestration menu
  // (which agent to spawn per step) without the CLI spawning anything itself.
  const planner = createStepsPlanner(config as unknown as Record<string, unknown>)
  const validator = createValidator(
    config as unknown as Record<string, { fields?: Record<string, unknown> } | undefined>,
    planner.plan,
  )
  const cli = createCliFn({
    nodeOps: facade,
    tierFor: tierOfNode,
    classify: deps.classify,
    steps: planner.plan,
    validate: validator.validate,
    ...(deps.run !== undefined ? { run: deps.run } : {}),
    out: deps.out,
    ...(deps.version !== undefined ? { version: deps.version } : {}),
  })

  return { cli, ops: facade, config }
}
