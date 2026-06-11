import { test, expect } from 'bun:test'
import { PhaseNodeSchema, phaseDescriptor } from './phase.js'
import { TaskNodeSchema, taskDescriptor } from './task.js'
import { EpicNodeSchema, epicDescriptor } from './epic.js'
import { projectDescriptor } from './project.js'

const phase = { name: 'Seam', slug: 'seam', status: 'pending' as const }
const task = { schema_version: 2, slug: 'my-task', title: 'T', status: 'plan' as const }
const epic = { schema_version: 2, slug: 'my-epic', title: 'E', status: 'planning' as const }

// a1 — each descriptor parses a valid node, rejects a wrong-tier status
test('descriptors parse valid nodes and reject foreign status', () => {
  expect(PhaseNodeSchema.safeParse(phase).success).toBe(true)
  expect(TaskNodeSchema.safeParse(task).success).toBe(true)
  expect(EpicNodeSchema.safeParse(epic).success).toBe(true)
  expect(PhaseNodeSchema.safeParse({ ...phase, status: 'plan' }).success).toBe(false) // task status
  expect(TaskNodeSchema.safeParse({ ...task, status: 'pending' }).success).toBe(false) // phase status
})

// a2 — executor optional, no injected default; round-trips without adding the key
test('phase executor is optional with no injected default', () => {
  const parsed = PhaseNodeSchema.parse(phase)
  expect('executor' in parsed).toBe(false)
  expect(parsed).toEqual(phase)
  expect(PhaseNodeSchema.safeParse({ ...phase, executor: 'workflow' }).success).toBe(true)
})

// a3 — childTier relationships are machine-readable
test('descriptors expose childTier (phase leaf, task→phase, epic→task)', () => {
  expect(phaseDescriptor.childTier).toBeUndefined()
  expect(taskDescriptor.childTier).toBe('phase')
  expect(epicDescriptor.childTier).toBe('task')
  expect(phaseDescriptor.statusEnum).toContain('blocked')
})

// a4 — task slug flat OR nested; phase/epic kebab only
test('task slug allows nested; phase rejects nested', () => {
  expect(TaskNodeSchema.safeParse({ ...task, slug: 'my-epic/my-task' }).success).toBe(true)
  expect(TaskNodeSchema.safeParse({ ...task, slug: 'my-task' }).success).toBe(true)
  expect(PhaseNodeSchema.safeParse({ ...phase, slug: 'a/b' }).success).toBe(false)
  expect(EpicNodeSchema.safeParse({ ...epic, slug: 'a/b' }).success).toBe(false)
})

// a5 — project reserved descriptor, same form
test('project is a reserved descriptor with childTier epic', () => {
  expect(projectDescriptor.tier).toBe('project')
  expect(projectDescriptor.childTier).toBe('epic')
})
