import { test, expect } from 'bun:test'
import {
  recordReceipt,
  assertStepsReceipted,
  stageClosedBy,
  type StepReceiptLike,
} from './receipts.js'

const r = (stage: string, step: string, status = 'done', note?: string): StepReceiptLike => ({
  stage,
  step,
  status,
  ...(note !== undefined ? { note } : {}),
})

// recordReceipt appends a new (stage, step) key and upserts an existing one in place.
test('recordReceipt appends new keys and upserts by (stage, step)', () => {
  const one = recordReceipt([], r('refine', 'plan-check'))
  expect(one).toHaveLength(1)
  const two = recordReceipt(one, r('refine', 'walk'))
  expect(two.map((x) => x.step)).toEqual(['plan-check', 'walk'])
  // same step, other stage → a separate receipt (keyed by the pair, not the name)
  const three = recordReceipt(two, r('build', 'walk'))
  expect(three).toHaveLength(3)
  // re-running a step overwrites its receipt in place (no duplicates, order kept)
  const upserted = recordReceipt(three, r('refine', 'plan-check', 'skipped', 'covered manually'))
  expect(upserted).toHaveLength(3)
  expect(upserted[0]).toMatchObject({ status: 'skipped', note: 'covered manually' })
})

// the stage-closing gate: missing receipts throw with the missing steps listed; done and
// skipped both count (a documented skip closes the step); other stages' receipts don't.
test('assertStepsReceipted blocks on missing receipts and lists them', () => {
  const required = [{ name: 'plan-check' }, { name: 'walk' }]
  expect(() => assertStepsReceipted(required, [], 'refine', 'task')).toThrow(/plan-check, walk/)
  const partial = [r('refine', 'plan-check')]
  expect(() => assertStepsReceipted(required, partial, 'refine', 'task')).toThrow(/walk/)
  // a receipt from ANOTHER stage never satisfies this stage's step
  const wrongStage = [r('build', 'plan-check'), r('build', 'walk')]
  expect(() => assertStepsReceipted(required, wrongStage, 'refine', 'task')).toThrow(
    /plan-check, walk/,
  )
  const full = [r('refine', 'plan-check'), r('refine', 'walk', 'skipped', 'no open questions')]
  expect(() => assertStepsReceipted(required, full, 'refine', 'task')).not.toThrow()
})

// a stage with no served steps passes trivially (nothing to enforce).
test('assertStepsReceipted passes on an empty required list', () => {
  expect(() => assertStepsReceipted([], [], 'build', 'task')).not.toThrow()
})

// stageClosedBy maps the closing transitions; the legal skip edges close nothing.
test('stageClosedBy names the closed stage; skip edges are free', () => {
  expect(stageClosedBy('plan', 'drafted')).toBe('plan')
  expect(stageClosedBy('drafted', 'refined')).toBe('refine')
  expect(stageClosedBy('build', 'wrap')).toBe('build')
  expect(stageClosedBy('build', 'done')).toBe('build') // wrap skipped — build still closes
  expect(stageClosedBy('wrap', 'done')).toBe('wrap')
  // skip + re-entry edges: refine skipped (drafted→build) and backward re-entry close nothing
  expect(stageClosedBy('drafted', 'build')).toBeUndefined()
  expect(stageClosedBy('refined', 'build')).toBeUndefined()
  expect(stageClosedBy('done', 'drafted')).toBeUndefined()
})
