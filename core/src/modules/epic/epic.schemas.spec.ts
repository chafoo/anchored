import { test, expect } from 'bun:test'
import { EpicNodeSchema } from './epic.schemas.js'

const node = { schema_version: 2, slug: 'my-epic', title: 'E', status: 'plan' as const }

test('EpicNodeSchema parses a valid epic; rejects a nested slug (kebab only)', () => {
  expect(EpicNodeSchema.safeParse(node).success).toBe(true)
  expect(EpicNodeSchema.safeParse({ ...node, slug: 'a/b' }).success).toBe(false)
})

test('task-stubs use the loop-queue marker axis (active), not the phase in-progress', () => {
  const stub = (status: string) => ({ ...node, tasks: [{ slug: 't1', status }] })
  expect(EpicNodeSchema.safeParse(stub('active')).success).toBe(true)
  expect(EpicNodeSchema.safeParse(stub('in-progress')).success).toBe(false)
})
