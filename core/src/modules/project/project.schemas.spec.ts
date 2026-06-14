import { test, expect } from 'bun:test'
import { ProjectNodeSchema } from './project.schemas.js'

const node = { schema_version: 2, slug: 'my-project', title: 'P', status: 'plan' as const }

test('ProjectNodeSchema walks the uniform lifecycle (not the old planning/building)', () => {
  expect(ProjectNodeSchema.safeParse(node).success).toBe(true)
  expect(ProjectNodeSchema.safeParse({ ...node, status: 'refined' }).success).toBe(true)
  expect(ProjectNodeSchema.safeParse({ ...node, status: 'planning' }).success).toBe(false)
})

test('epic-stubs use the stub marker axis', () => {
  const stub = (status: string) => ({ ...node, epics: [{ slug: 'e1', status }] })
  expect(ProjectNodeSchema.safeParse(stub('active')).success).toBe(true)
  expect(ProjectNodeSchema.safeParse(stub('in-progress')).success).toBe(false)
})
