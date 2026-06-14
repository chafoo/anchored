import { test, expect } from 'bun:test'
import { TaskNodeSchema } from './task.schemas.js'

const node = { schema_version: 2, slug: 'my-task', title: 'T', status: 'plan' as const }

test('TaskNodeSchema parses a valid task; rejects a phase status; allows flat + nested slug', () => {
  expect(TaskNodeSchema.safeParse(node).success).toBe(true)
  expect(TaskNodeSchema.safeParse({ ...node, status: 'pending' }).success).toBe(false)
  expect(TaskNodeSchema.safeParse({ ...node, slug: 'my-epic/my-task' }).success).toBe(true)
})

test('a task embeds full phases (with the evidence invariant on their ACs)', () => {
  const withPhase = (evidence?: string[]) => ({
    ...node,
    phases: [
      {
        name: 'Setup',
        slug: 'setup',
        status: 'done',
        acceptance_criteria: [
          { id: 'a1', text: 't', status: 'done', ...(evidence && { evidence }) },
        ],
      },
    ],
  })
  expect(TaskNodeSchema.safeParse(withPhase()).success).toBe(false) // done AC w/o evidence
  expect(TaskNodeSchema.safeParse(withPhase(['x:1 — p'])).success).toBe(true)
})
