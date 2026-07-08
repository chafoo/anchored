import { test, expect } from 'bun:test'
import { closeBlockers } from './close-gate.js'
import { RunSchema } from '../run.schemas.js'
import { midFlightRun, closedRun } from '../run.fixtures.js'

test('open and failed criteria block; done/superseded/rejected do not', () => {
  const blockers = closeBlockers(RunSchema.parse(midFlightRun))
  expect(blockers.map((b) => `${b.id}:${b.status}`).sort()).toEqual([
    'c3:open',
    'c4:failed',
    'c5:open',
  ])
})

test('a fully proven run has no blockers', () => {
  expect(closeBlockers(RunSchema.parse(closedRun))).toEqual([])
})
