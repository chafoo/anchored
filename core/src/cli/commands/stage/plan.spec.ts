import { test, expect } from 'bun:test'
import { planCommand } from './plan.js'
import type { CliDeps } from '../../cli.js'
import { fakeFacade } from '../../cli.spec.js'

type PlanResult = {
  tier: string
  reasoning?: string
  node: { slug: string }
  steps: unknown[]
}

// a1 — explicit tier → engine.run path: no classify, create seeded with that tier
test('explicit tier dispatches directly without classify', async () => {
  const created: { slug: string; opts: unknown }[] = []
  let classified = false
  const deps: CliDeps = {
    nodeOps: fakeFacade({
      create: async (slug, opts) => {
        created.push({ slug, opts })
        return { slug }
      },
    }),
    tierFor: () => 'task',
    classify: async () => {
      classified = true
      return { tier: 'epic' }
    },
    out: () => {},
  }
  const r = (await planCommand(['epic', 'build', 'a', 'subsystem'], deps)) as PlanResult
  expect(r.tier).toBe('epic')
  expect(r.reasoning).toBeUndefined()
  expect(classified).toBe(false)
  // input is the joined rest; create gets { title, tier } so it seeds the right shape
  expect(created).toEqual([
    { slug: 'build-a-subsystem', opts: { title: 'build a subsystem', tier: 'epic' } },
  ])
})

// a2 — no tier → routed through classify; reasoning is forwarded into the result
test('no tier routes through classify and surfaces reasoning', async () => {
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
    tierFor: () => 'task',
    classify: async (input) => ({ tier: 'epic', reasoning: `for ${input}` }),
    out: () => {},
  }
  const r = (await planCommand(['a', 'whole', 'subsystem'], deps)) as PlanResult
  expect(r.tier).toBe('epic')
  expect(r.reasoning).toBe('for a whole subsystem')
})

// a3 — no tier AND no classify seam → loud NoTier cliError (no silent default)
test('no tier without classify throws NoTier', async () => {
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
    tierFor: () => 'task',
    out: () => {},
  }
  await expect(planCommand(['just some prose'], deps)).rejects.toMatchObject({ name: 'NoTier' })
})

// a4 — F3: --slug <value> overrides the derived slug; tier/input parsing ignores it
test('--slug overrides the derived slug', async () => {
  let seenSlug = ''
  const deps: CliDeps = {
    nodeOps: fakeFacade({
      create: async (slug, opts) => {
        seenSlug = slug
        return { slug, opts }
      },
    }),
    tierFor: () => 'task',
    out: () => {},
  }
  const r = (await planCommand(
    ['epic', '--slug', 'tasks-app', 'a', 'very', 'long', 'prose', 'description'],
    deps,
  )) as PlanResult
  expect(seenSlug).toBe('tasks-app')
  expect(r.tier).toBe('epic')
})

// a5 — F3: --slug=value (equals form) is stripped + slugified too
test('--slug=value equals form overrides the derived slug', async () => {
  let seenSlug = ''
  const deps: CliDeps = {
    nodeOps: fakeFacade({
      create: async (slug) => {
        seenSlug = slug
        return { slug }
      },
    }),
    tierFor: () => 'task',
    out: () => {},
  }
  await planCommand(['task', '--slug=My Cool App', 'whatever'], deps)
  expect(seenSlug).toBe('my-cool-app')
})

// a6 — steps seam present → resolved plan-stage steps are returned for the skill
test('steps seam supplies the resolved plan-stage steps', async () => {
  const seen: [string, string][] = []
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
    tierFor: () => 'task',
    steps: (tier, stage) => {
      seen.push([tier, stage])
      return { steps: [{ name: 'discover' }, { name: 'decompose' }] } as never
    },
    out: () => {},
  }
  const r = (await planCommand(['task', 'do a thing'], deps)) as PlanResult
  expect(seen).toEqual([['task', 'plan']])
  expect(r.steps).toEqual([{ name: 'discover' }, { name: 'decompose' }])
})

// a7 — no steps seam → empty-steps fallback (no engine spawn in the headless CLI)
test('absent steps seam falls back to an empty step list', async () => {
  const deps: CliDeps = {
    nodeOps: fakeFacade(),
    tierFor: () => 'task',
    out: () => {},
  }
  const r = (await planCommand(['task', 'do a thing'], deps)) as PlanResult
  expect(r.steps).toEqual([])
})
