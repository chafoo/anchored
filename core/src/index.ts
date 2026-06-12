// src/index.ts — the public entry of the core package: a PURE wiring factory.
// createAnchored(deps) bootstraps the merged config ONCE and wires the substrate
// in deps-graph order (parser/render/io → ops → engine → cli), returning the live
// object graph { cli, engine, ops, config }. No top-level side-effect, no classes,
// no runtime/bin access — all of that lives only in src/bin.ts. Every effect (fs,
// yaml, spawn, merge) arrives through an injected seam, so the whole graph is
// fakeable (wiring tests inject spy sub-factories).
import { z } from 'zod'
import { parse, stringify } from 'yaml'
import { createCli, type CliDeps, type NodeOpsFacade } from './cli/index.js'
import { createNodeOps, type TierDescriptor, type NodeOpsDeps } from './ops/node-ops.js'
import { createSlugFacade, type TierOps } from './ops/facade.js'
import { createEngineOps, tierOfNode } from './ops/engine-ops.js'
import { makeTierFor } from './ops/tier-derive.js'
import { createStepsPlanner } from './ops/steps-planner.js'
import { createValidator } from './ops/validate.js'
import { createParser } from './parser/parse.js'
import { createRenderer, defaultSchemaUrl } from './parser/render.js'
import { createIo, type IoDeps } from './io.js'
import { createBootstrap } from './config/bootstrap.js'
import { createSpawn } from './spawn.js'
import { createEngine } from './engine/engine.js'
import type { AnyNode, SpawnLike, RunnerDeps, TierCfg } from './engine/step-runner.js'
import { phaseDescriptor, PhaseNodeSchema } from './schema/tiers/phase.js'
import { taskDescriptor, TaskNodeSchema } from './schema/tiers/task.js'
import { epicDescriptor, EpicNodeSchema } from './schema/tiers/epic.js'
import { ConfigSchema, type Config } from './schema/config.js'
import { extendSchemaWithFields } from './schema/custom-fields.js'

export { tierOfNode }

const DESCRIPTORS: Record<string, TierDescriptor> = {
  phase: phaseDescriptor as TierDescriptor,
  task: taskDescriptor as TierDescriptor,
  epic: epicDescriptor as TierDescriptor,
}
const DEFAULT_STATUS: Record<string, string> = { phase: 'pending', task: 'plan', epic: 'plan' }

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
  const parser = createParser({
    yaml: { parse },
    schemas: {
      task: taskSchema,
      epic: epicSchema,
      phase: phaseSchema,
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
  const descFor = (tier: string, schema: z.ZodType): TierDescriptor => ({
    ...DESCRIPTORS[tier]!,
    schema,
  })
  const opsByTier: Record<string, TierOps> = {
    phase: createNodeOpsFn(
      descFor('phase', phaseSchema),
      opsDepsFor('phase'),
    ) as unknown as TierOps,
    task: createNodeOpsFn(descFor('task', taskSchema), opsDepsFor('task')) as unknown as TierOps,
    epic: createNodeOpsFn(descFor('epic', epicSchema), opsDepsFor('epic')) as unknown as TierOps,
  }
  return { opsByTier, opsFor: (tier) => opsByTier[tier] ?? opsByTier.task! }
}

// ── buildCli: the slug-facade + cli wiring used by the e2e harness ──
export interface WireDeps {
  io: IoDeps
  pathFor: (slug: string) => string
  out: (line: string) => void
  tierForSlug?: (slug: string) => string
  engine?: CliDeps['engine']
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
  const engine: CliDeps['engine'] = w.engine ?? {
    run: (_tier, node) => Promise.resolve({ node, status: 'ok' }),
  }
  return createCli({
    nodeOps: facade,
    engine,
    tierFor: tierOfNode,
    classify: w.classify,
    ...(w.run !== undefined ? { run: w.run } : {}),
    out: w.out,
  })
}

// ── createAnchored: the full object graph (config + ops + engine + cli) ──
export interface AnchoredWiring {
  merge?: (defaultCfg: Config, userCfg: Config) => Config
  createNodeOps?: typeof createNodeOps
  createEngine?: typeof createEngine
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
  run?: RunnerDeps['run']
  spawn?: SpawnLike
  classify?: CliDeps['classify']
  now?: () => string
  version?: string
  wiring?: AnchoredWiring
}

export interface Anchored {
  cli: ReturnType<typeof createCli>
  engine: { run(tier: string, node: AnyNode): Promise<{ node: AnyNode; status: string }> }
  ops: NodeOpsFacade
  config: Config
}

export function createAnchored(deps: AnchoredDeps): Anchored {
  const wiring = deps.wiring ?? {}
  const createNodeOpsFn = wiring.createNodeOps ?? createNodeOps
  const createEngineFn = wiring.createEngine ?? createEngine
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
  }
  const { opsByTier, opsFor } = buildSubstrate(io, pathFor, createNodeOpsFn, fieldsByTier)
  const facade = createSlugFacade({
    opsFor,
    tierFor: makeTierFor(io, pathFor),
    defaultStatus: DEFAULT_STATUS,
    now: deps.now,
    pathFor,
    io,
  })

  // engine — built BEFORE the cli, fed the ops from the previous stage
  const spawn = deps.spawn ?? createSpawn(config as unknown as { spawn?: { mode?: string } }, {})
  const engine = createEngineFn({
    config: config as unknown as Record<string, TierCfg>,
    run: deps.run ?? (() => Promise.resolve({ code: 0, stdout: '', stderr: '' })),
    spawn,
    ops: createEngineOps(opsByTier),
    descriptorFor: (tier) => ({ childTier: DESCRIPTORS[tier]?.childTier }),
  })

  // cli — the single transport, fed the engine + ops from the previous stages.
  // The steps planner gives the in-session skills their config-driven orchestration
  // menu (which agent to spawn per step) without the CLI spawning anything itself.
  const planner = createStepsPlanner(config as unknown as Record<string, unknown>)
  const validator = createValidator(
    config as unknown as Record<string, { fields?: Record<string, unknown> } | undefined>,
    planner.plan,
  )
  const cli = createCliFn({
    nodeOps: facade,
    engine,
    tierFor: tierOfNode,
    classify: deps.classify,
    steps: planner.plan,
    validate: validator.validate,
    ...(deps.run !== undefined ? { run: deps.run } : {}),
    out: deps.out,
    ...(deps.version !== undefined ? { version: deps.version } : {}),
  })

  return { cli, engine, ops: facade, config }
}
