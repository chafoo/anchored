// e2e/extensibility-matrix.spec.ts — the "extend anchored arbitrarily without touching
// code" guarantee, test-locked. Two matrices:
//   1. a custom run-step resolves in EVERY tier × stage (plan/refine/build/wrap),
//   2. a custom field validates on EVERY tier (phase/task/epic) — read + write.
// If either regresses, a user's large hand-built anchored.yml would silently stop
// firing custom steps or rejecting/accepting the wrong fields.
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { createStepsPlanner } from './plan-for.js'
import { merge } from '../../services/config/merge.js'
import { ConfigSchema } from '../../services/config/config-schema/config.js'
import { extendSchemaWithFields } from '../../services/config/config-schema/custom-fields.js'
import { PhaseNodeSchema } from '../../modules/phase/phase.js'
import { TaskNodeSchema } from '../../modules/task/task.js'
import { EpicNodeSchema } from '../../modules/epic/epic.js'
import { STAGES } from '../../lib/constants/stages.js'

const TIERS = ['phase', 'task', 'epic'] as const

describe('custom run-step resolves in every tier × stage', () => {
  for (const tier of TIERS) {
    for (const stage of STAGES) {
      test(`${tier}.${stage} carries a custom run-step (kind:run)`, () => {
        // a minimal config that adds ONE custom run-step to this tier/stage
        const config = { [tier]: { [stage]: { steps: [{ name: 'my-custom', run: 'echo hi' }] } } }
        const planner = createStepsPlanner(config as Record<string, unknown>)
        const steps = planner.plan(tier, stage).steps
        const custom = steps.find((s) => s.name === 'my-custom')
        expect(custom).toBeDefined()
        expect(custom!.kind).toBe('run')
        expect(custom!.run).toBe('echo hi')
      })
    }
  }
})

describe('custom use-step resolves in every tier × stage', () => {
  for (const tier of TIERS) {
    for (const stage of STAGES) {
      test(`${tier}.${stage} carries a custom use-step (kind:worker → agent ref)`, () => {
        const config = {
          [tier]: {
            [stage]: {
              steps: [{ name: 'researcher', use: 'researcher', instructions: 'web search' }],
            },
          },
        }
        const planner = createStepsPlanner(config as Record<string, unknown>)
        const steps = planner.plan(tier, stage).steps
        const custom = steps.find((s) => s.name === 'researcher')
        expect(custom).toBeDefined()
        // a use-step that doesn't map to a known plugin worker is still a worker-kind
        // step the orchestrator dispatches as a subagent; its instructions survive.
        expect(custom!.kind).toBe('worker')
        expect(custom!.instructions).toBe('web search')
      })
    }
  }
})

describe('custom field validates on every tier (read + write)', () => {
  const SCHEMAS = {
    phase: { schema: PhaseNodeSchema, base: { name: 'p', slug: 'p', status: 'pending' as const } },
    task: {
      schema: TaskNodeSchema,
      base: { schema_version: 2, slug: 't', title: 'T', status: 'plan' as const },
    },
    epic: {
      schema: EpicNodeSchema,
      base: { schema_version: 2, slug: 'e', title: 'E', status: 'plan' as const },
    },
  }
  for (const tier of TIERS) {
    test(`${tier}: a declared custom field is accepted, an undeclared one is rejected`, () => {
      const { schema, base } = SCHEMAS[tier]
      const extended = extendSchemaWithFields(schema, { research: 'string' })
      // declared → validates + round-trips
      const ok = extended.parse({ ...base, research: 'findings' })
      expect((ok as { research?: string }).research).toBe('findings')
      // undeclared → still rejected (strictness preserved)
      expect(() => extended.parse({ ...base, undeclared_x: 1 })).toThrow()
    })
  }
})

// D4 — the comprehensive example anchored.yml (research-in-plan → research field,
// TDD implement instruction, per-phase commit, custom steps across all 4 stages):
// it must parse against the Config schema AND resolve, merged onto the defaults,
// with every custom step + field landing where intended. This is the worked proof
// that a large hand-built yml extends anchored without touching code.
describe('comprehensive example anchored.yml is valid + fully resolves', () => {
  const raw = readFileSync(
    new URL('../../../../plugin/references/anchored.example-comprehensive.yml', import.meta.url),
    'utf8',
  )
  const defaultRaw = readFileSync(
    new URL('../../../default-template/anchored.default.yml', import.meta.url),
    'utf8',
  )

  test('parses against the Config schema', () => {
    expect(() => ConfigSchema.parse(parse(raw))).not.toThrow()
  })

  test('merged onto defaults: custom steps + fields resolve in the right places', () => {
    const merged = merge(ConfigSchema.parse(parse(defaultRaw)), ConfigSchema.parse(parse(raw)))
    const planner = createStepsPlanner(merged as unknown as Record<string, unknown>)
    const names = (tier: string, stage: string) =>
      planner.plan(tier, stage).steps.map((s) => s.name)

    // research lands AFTER discover (before decompose) — informs the decomposition
    expect(names('task', 'plan')).toEqual(['discover', 'research', 'rules-scan', 'decompose'])
    // audit gate sits after rules-check; commit after the build gates
    expect(names('task', 'refine')).toContain('audit')
    expect(names('phase', 'build')).toEqual([
      'implement',
      'task-validate',
      'code-validate',
      'commit',
    ])
    // the TDD instruction merged onto the implement worker
    const impl = planner.plan('phase', 'build').steps.find((s) => s.name === 'implement')
    expect(impl!.instructions).toMatch(/TDD/i)

    // custom fields declared per tier
    const fields = (tier: string) =>
      Object.keys(
        (merged as Record<string, { fields?: Record<string, unknown> }>)[tier]?.fields ?? {},
      )
    expect(fields('task')).toEqual(expect.arrayContaining(['research', 'commit_sha']))
    expect(fields('phase')).toContain('coverage_pct')
    expect(fields('epic')).toContain('research')
  })
})
