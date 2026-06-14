import { test, expect } from 'bun:test'
import { stepsCommand } from './steps.js'
import type { CliDeps } from '../../cli.js'
import type { StepPlan } from '../../../lib/contracts/config.js'
import { fakeFacade } from '../../cli.spec.js'

function depsWith(over: Partial<CliDeps> = {}): CliDeps {
  return {
    nodeOps: fakeFacade(),
    tierFor: () => 'task',
    out: () => {},
    ...over,
  }
}

const plan: StepPlan = {
  tier: 'task',
  stage: 'build',
  steps: [{ name: 'implement', kind: 'worker', agent: 'build-implement' }],
}

// a1 — forwards (tier, stage) to the steps planner and returns its plan verbatim
test('forwards tier+stage to the planner and returns the plan', async () => {
  const seen: Array<[string, string]> = []
  const r = (await stepsCommand(['task', 'build'], {
    ...depsWith({
      steps: (tier, stage) => {
        seen.push([tier, stage])
        return plan
      },
    }),
  })) as StepPlan
  expect(seen).toEqual([['task', 'build']])
  expect(r).toEqual(plan)
})

// a2 — missing tier → MissingArgument cliError, planner never called
test('missing tier throws MissingArgument and never calls the planner', async () => {
  let called = false
  const deps = depsWith({
    steps: () => {
      called = true
      return plan
    },
  })
  await expect(stepsCommand([], deps)).rejects.toMatchObject({
    name: 'MissingArgument',
    message: expect.stringContaining('tier'),
  })
  expect(called).toBe(false)
})

// a3 — tier present but stage missing → MissingArgument naming the stage
test('missing stage throws MissingArgument naming stage', async () => {
  const deps = depsWith({ steps: () => plan })
  await expect(stepsCommand(['task'], deps)).rejects.toMatchObject({
    name: 'MissingArgument',
    message: expect.stringContaining('stage'),
  })
})

// a4 — planner not wired → Unsupported cliError (CLI build lacks the seam)
test('unwired planner throws Unsupported', async () => {
  const deps = depsWith({ steps: undefined })
  await expect(stepsCommand(['task', 'build'], deps)).rejects.toMatchObject({
    name: 'Unsupported',
  })
})
