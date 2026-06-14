import { test, expect } from 'bun:test'
import { PhaseNodeSchema } from './phase.schemas.js'

const node = { name: 'Setup', slug: 'setup', status: 'pending' as const }

test('PhaseNodeSchema parses a valid phase; rejects a foreign (task) status + a nested slug', () => {
  expect(PhaseNodeSchema.safeParse(node).success).toBe(true)
  expect(PhaseNodeSchema.safeParse({ ...node, status: 'plan' }).success).toBe(false)
  expect(PhaseNodeSchema.safeParse({ ...node, slug: 'a/b' }).success).toBe(false)
})

test('executor optional with no injected default; a done AC needs evidence', () => {
  const parsed = PhaseNodeSchema.parse(node)
  expect('executor' in parsed).toBe(false)
  expect(PhaseNodeSchema.safeParse({ ...node, executor: 'workflow' }).success).toBe(true)
  const ac = (evidence?: string[]) => ({
    ...node,
    acceptance_criteria: [
      { id: 'a1', text: 't', status: 'done' as const, ...(evidence && { evidence }) },
    ],
  })
  expect(PhaseNodeSchema.safeParse(ac()).success).toBe(false)
  expect(PhaseNodeSchema.safeParse(ac(['src/x.ts:1 — p'])).success).toBe(true)
})
