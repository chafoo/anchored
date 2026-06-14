import { test, expect } from 'bun:test'
import { PhaseNodeSchema, phase } from './phase.js'

const node = { name: 'Seam', slug: 'seam', status: 'pending' as const }

// schema parses a valid phase, rejects a foreign (task) status
test('PhaseNodeSchema parses a valid phase, rejects a task status', () => {
  expect(PhaseNodeSchema.safeParse(node).success).toBe(true)
  expect(PhaseNodeSchema.safeParse({ ...node, status: 'plan' }).success).toBe(false)
})

// executor optional, no injected default; round-trips without adding the key
test('phase executor is optional with no injected default', () => {
  const parsed = PhaseNodeSchema.parse(node)
  expect('executor' in parsed).toBe(false)
  expect(parsed).toEqual(node)
  expect(PhaseNodeSchema.safeParse({ ...node, executor: 'workflow' }).success).toBe(true)
})

// slug is kebab only (no nesting); a done AC needs evidence (the invariant mirror)
test('phase slug rejects nesting; done AC requires evidence', () => {
  expect(PhaseNodeSchema.safeParse({ ...node, slug: 'a/b' }).success).toBe(false)
  const withDoneAc = (evidence?: string[]) => ({
    ...node,
    acceptance_criteria: [
      { id: 'a1', text: 't', status: 'done' as const, ...(evidence && { evidence }) },
    ],
  })
  expect(PhaseNodeSchema.safeParse(withDoneAc()).success).toBe(false)
  expect(PhaseNodeSchema.safeParse(withDoneAc(['src/x.ts:1 — p'])).success).toBe(true)
})

// the condition bundle: phase is the leaf — no child relationship
test('phase bundle is the leaf (no childTier), full status axis', () => {
  expect(phase.tier).toBe('phase')
  expect(phase.childTier).toBeUndefined()
  expect(phase.defaultStatus).toBe('pending')
  expect(phase.statusValues).toContain('blocked')
})
