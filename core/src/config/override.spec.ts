// config/override.spec.ts — V1. Prove EMPIRICALLY (through createAnchored + its CLI,
// the same wiring bin.ts uses — not just the merge unit) that a user's project-root
// anchored.yml overrides the framework-default policy AND deep-merges: an override
// touching one stage must NOT clobber the rest of the default block.
import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { createAnchored } from '../index.js'
import type { StepPlan } from '../cli/commands/steps.js'

const DEFAULT_YML = readFileSync(
  new URL('../../default-template/anchored.default.yml', import.meta.url),
  'utf8',
)

function anchoredWith(userYml?: string) {
  const store = new Map<string, string>()
  const out: string[] = []
  const anchored = createAnchored({
    projectRoot: '/p',
    io: {
      fs: {
        mkdir: async () => undefined,
        writeFile: async (p: string, d: string) => {
          store.set(p, d)
        },
        rename: async () => undefined,
        readFile: async (p: string) => store.get(p) ?? '',
      },
      lock: { acquire: async () => async () => {} },
      rand: () => 'r',
      pid: () => 1,
    },
    pathFor: (s) => `/p/${s}.yml`,
    tierForSlug: () => 'task',
    readDefault: () => DEFAULT_YML,
    readUser: () => userYml,
    parseYaml: (raw) => parse(raw),
    out: (l) => out.push(l),
  })
  // resolve a stage's plan THROUGH the CLI (the path the skills actually use)
  const plan = async (tier: string, stage: string): Promise<StepPlan> => {
    await anchored.cli.run(['steps', tier, stage])
    return (JSON.parse(out[out.length - 1]!) as { result: StepPlan }).result
  }
  return { plan }
}

const names = (p: StepPlan): string[] => p.steps.map((s) => s.name)
const retryOf = (p: StepPlan): number | undefined =>
  p.steps.find((s) => s.kind === 'loop')?.retry_limit

// V1 — a user override both EXTENDS a stage's steps and OVERRIDES a scalar, and
// the deep-merge leaves every other default untouched (a shallow merge would have
// wiped task.build when the user set only task.refine + task.build.retry_limit).
test('V1: a user anchored.yml override applies + deep-merges through the CLI', async () => {
  const base = anchoredWith() // no user delta = all defaults
  const baseRefine = names(await base.plan('task', 'refine'))
  const baseBuild = await base.plan('task', 'build')
  expect(baseRefine.length).toBeGreaterThan(0) // sanity: defaults resolved
  expect(retryOf(baseBuild)).toBe(3) // framework default

  const override = anchoredWith(`
task:
  refine:
    steps:
      - { name: my-lint, run: "eslint .", after: rules-check }
  build:
    retry_limit: 7
`)
  const ovRefine = names(await override.plan('task', 'refine'))

  // (1) the override APPLIES — the custom step is in the resolved refine plan
  expect(ovRefine).toContain('my-lint')
  // inserted after rules-check (the `after:` anchor), not appended blindly
  expect(ovRefine.indexOf('my-lint')).toBe(ovRefine.indexOf('rules-check') + 1)

  // (2) extend-only — every default refine step is still present (built-ins never drop)
  for (const n of baseRefine) expect(ovRefine).toContain(n)

  // (3) scalar override deep-merges into task.build (retry_limit 3 → 7)
  expect(retryOf(await override.plan('task', 'build'))).toBe(7)

  // (4) DEEP merge, no clobber — touching task.refine + task.build.retry_limit left
  // the task.build STEP plan identical to the default (a shallow merge would have
  // replaced the whole task.build block and lost the each:phase loop)
  expect(names(await override.plan('task', 'build'))).toEqual(names(baseBuild))
})
