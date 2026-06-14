import { test, expect } from 'bun:test'
import { TaskNodeSchema, task } from './task.js'

const node = { schema_version: 2, slug: 'my-task', title: 'T', status: 'plan' as const }

// schema parses a valid task, rejects a foreign (phase) status
test('TaskNodeSchema parses a valid task, rejects a phase status', () => {
  expect(TaskNodeSchema.safeParse(node).success).toBe(true)
  expect(TaskNodeSchema.safeParse({ ...node, status: 'pending' }).success).toBe(false)
})

// task slug is flat OR nested under an epic
test('task slug allows flat and nested', () => {
  expect(TaskNodeSchema.safeParse({ ...node, slug: 'my-task' }).success).toBe(true)
  expect(TaskNodeSchema.safeParse({ ...node, slug: 'my-epic/my-task' }).success).toBe(true)
})

// the condition bundle: task → phase, with the phase child axes
test('task bundle declares the phase child relationship', () => {
  expect(task.tier).toBe('task')
  expect(task.childTier).toBe('phase')
  expect(task.childField).toBe('phases')
  expect(task.defaultStatus).toBe('plan')
  expect(task.childStatusValues).toContain('in-progress')
  expect(task.childTerminalOk).toEqual(['done', 'deferred'])
  expect(task.childExecutorValues).toEqual(['implement', 'workflow'])
})
