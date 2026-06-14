import { test, expect } from 'bun:test'
import { ProjectNodeSchema, project } from './project.js'

const node = { schema_version: 2, slug: 'my-project', title: 'P', status: 'plan' as const }

// project now walks the full uniform lifecycle (was the reduced planning/building)
test('ProjectNodeSchema parses a valid project on the lifecycle axis', () => {
  expect(ProjectNodeSchema.safeParse(node).success).toBe(true)
  expect(ProjectNodeSchema.safeParse({ ...node, status: 'refined' }).success).toBe(true)
  expect(ProjectNodeSchema.safeParse({ ...node, status: 'planning' }).success).toBe(false)
})

// epic-stubs use the loop-queue marker axis (mirrors epic's task-stubs)
test('project epic-stubs accept the stub status axis', () => {
  const withStub = (status: string) => ({ ...node, epics: [{ slug: 'e1', status }] })
  expect(ProjectNodeSchema.safeParse(withStub('active')).success).toBe(true)
  expect(ProjectNodeSchema.safeParse(withStub('in-progress')).success).toBe(false)
})

// the condition bundle: project → epic (stub children)
test('project bundle declares the epic child relationship', () => {
  expect(project.tier).toBe('project')
  expect(project.childTier).toBe('epic')
  expect(project.childField).toBe('epics')
  expect(project.defaultStatus).toBe('plan')
  expect(project.statusValues).toEqual(['plan', 'drafted', 'refined', 'build', 'wrap', 'done'])
  expect(project.childStatusValues).toEqual(['pending', 'active', 'done', 'blocked'])
  expect(project.childTerminalOk).toEqual(['done'])
})
