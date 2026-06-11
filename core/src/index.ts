// src/index.ts — the public entry of the core package: a PURE wiring factory.
// createAnchored(deps) bootstraps the merged config ONCE and wires the substrate
// in deps-graph order (parser/render/io → ops → engine → cli), returning the live
// object graph { cli, engine, ops, config }. No top-level side-effect, no classes,
// no runtime/bin access — all of that lives only in src/bin.ts. Every effect (fs,
// yaml, spawn, merge) arrives through an injected seam, so the whole graph is
// fakeable (wiring tests inject spy sub-factories).
import { parse, stringify } from 'yaml'
import { createCli, type CliDeps, type NodeOpsFacade } from './cli/index.js'
import { createNodeOps, type TierDescriptor, type NodeOpsDeps } from './ops/node-ops.js'
import { createSlugFacade, type TierOps } from './ops/facade.js'
import { createEngineOps, tierOfNode } from './ops/engine-ops.js'
import { makeTierFor } from './ops/tier-derive.js'
import { createStepsPlanner } from './ops/steps-planner.js'
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
): Substrate {
  const parser = createParser({
    yaml: { parse },
    schemas: {
      task: TaskNodeSchema,
      epic: EpicNodeSchema,
      phase: PhaseNodeSchema,
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
  const opsByTier: Record<string, TierOps> = {
    phase: createNodeOpsFn(DESCRIPTORS.phase!, opsDepsFor('phase')) as unknown as TierOps,
    task: createNodeOpsFn(DESCRIPTORS.task!, opsDepsFor('task')) as unknown as TierOps,
    epic: createNodeOpsFn(DESCRIPTORS.epic!, opsDepsFor('epic')) as unknown as TierOps,
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
}

export function buildCli(w: WireDeps) {
  const io = createIo(w.io)
  const { opsFor } = buildSubstrate(io, w.pathFor, createNodeOps)
  const facade = createSlugFacade({
    opsFor,
    tierFor: makeTierFor(io, w.pathFor),
    defaultStatus: DEFAULT_STATUS,
    now: w.now,
  })
  const engine: CliDeps['engine'] = w.engine ?? {
    run: (_tier, node) => Promise.resolve({ node, status: 'ok' }),
  }
  return createCli({
    nodeOps: facade,
    engine,
    tierFor: tierOfNode,
    classify: w.classify,
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

  // ops — built BEFORE the engine (deps-graph order: substrate → ops → engine → cli)
  const { opsByTier, opsFor } = buildSubstrate(io, pathFor, createNodeOpsFn)
  const facade = createSlugFacade({
    opsFor,
    tierFor: makeTierFor(io, pathFor),
    defaultStatus: DEFAULT_STATUS,
    now: deps.now,
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
  const cli = createCliFn({
    nodeOps: facade,
    engine,
    tierFor: tierOfNode,
    classify: deps.classify,
    steps: planner.plan,
    out: deps.out,
  })

  return { cli, engine, ops: facade, config }
}
