import { test, expect } from 'bun:test'
import { EpicNodeSchema, epic } from './epic.js'

const node = { schema_version: 2, slug: 'my-epic', title: 'E', status: 'plan' as const }

// schema parses a valid epic, rejects a nested slug (epic is kebab only)
test('EpicNodeSchema parses a valid epic, rejects a nested slug', () => {
  expect(EpicNodeSchema.safeParse(node).success).toBe(true)
  expect(EpicNodeSchema.safeParse({ ...node, slug: 'a/b' }).success).toBe(false)
})

// task-stubs use the loop-queue marker axis (active), not the phase 'in-progress'
test('epic task-stubs accept the stub status axis', () => {
  const withStub = (status: string) => ({ ...node, tasks: [{ slug: 't1', status }] })
  expect(EpicNodeSchema.safeParse(withStub('active')).success).toBe(true)
  expect(EpicNodeSchema.safeParse(withStub('in-progress')).success).toBe(false)
})

// the condition bundle: epic → task (stub children)
test('epic bundle declares the task child relationship via stubs', () => {
  expect(epic.tier).toBe('epic')
  expect(epic.childTier).toBe('task')
  expect(epic.childField).toBe('tasks')
  expect(epic.defaultStatus).toBe('plan')
  expect(epic.childStatusValues).toEqual(['pending', 'active', 'done', 'blocked'])
  expect(epic.childTerminalOk).toEqual(['done'])
  expect(epic.childExecutorValues).toBeUndefined()
})
