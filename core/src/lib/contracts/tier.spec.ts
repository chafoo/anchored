import { test, expect } from 'bun:test'
import type { TierCondition, TierDescriptor } from './tier.js'

// contracts/tier is interface-only — conformance spec pins the CONDITION bundle a
// `modules/<tier>` exports (schema + own axes + child relationship) that the
// orchestrator injects into the generic store.
test('a1 — a minimal condition bundle conforms to TierCondition', () => {
  const cond = {
    tier: 'task',
    schema: { parse: (x) => x },
    statusValues: ['plan', 'done'],
    transitions: { plan: ['done'], done: [] },
    defaultStatus: 'plan',
    childTier: 'phase',
    childField: 'phases',
    childStatusValues: ['pending', 'done'],
    childTerminalOk: ['done'],
    childExecutorValues: ['implement'],
  } satisfies TierCondition

  expect(cond.tier).toBe('task')
  expect(cond.schema.parse({ a: 1 })).toEqual({ a: 1 })
  expect(cond.transitions.plan).toContain('done')
})

// a2 — the leaf bundle omits the child relationship; TierDescriptor is the alias
test('a2 — a leaf bundle has no childTier; TierDescriptor accepts it', () => {
  const leaf: TierDescriptor = {
    tier: 'phase',
    schema: { parse: (x) => x },
    statusValues: ['pending', 'done'],
    transitions: { pending: ['done'], done: [] },
    defaultStatus: 'pending',
  }
  expect(leaf.childTier).toBeUndefined()
  expect(leaf.childField).toBeUndefined()
})
