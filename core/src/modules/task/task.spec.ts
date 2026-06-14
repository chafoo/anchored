import { test, expect } from 'bun:test'
import { createTask } from './task.js'
import { createFakeStore } from '../../services/store/store.fake.js'
import { taskNode } from './task.fixtures.js'
import type { TemplatePort } from '../../lib/contracts/template.js'
import type { TaskNode } from './task.schemas.js'

const template: TemplatePort = {
  steps: (tier, stage) => ({
    tier,
    stage,
    steps: [{ name: 'implement', worker: 'build-implement' }],
  }),
  fields: () => ({}),
  validate: () => ({ ok: true }),
  raw: () => ({}),
}

function setup(node: TaskNode = taskNode()) {
  const store = createFakeStore({ 'my-task': node })
  return { store, task: createTask({ store, template }) }
}
const on = (store: ReturnType<typeof createFakeStore>) => store.disk.get('my-task') as TaskNode

// a1 — get + the build stage plan (steps from template, node from store)
test('get returns the node; build returns the orchestration plan', async () => {
  const { task } = setup()
  expect(((await task.get('my-task')) as TaskNode).slug).toBe('my-task')
  const plan = (await task.run('build', ['my-task'])) as {
    stage: string
    steps: { worker?: string }[]
    node: TaskNode
  }
  expect(plan.stage).toBe('build')
  expect(plan.steps[0]!.worker).toBe('build-implement')
  expect(plan.node.slug).toBe('my-task')
})

// a2 — status: legal transition writes; illegal skip throws; set rejects a reserved field
test('status transitions are guarded; set refuses reserved fields', async () => {
  const { task, store } = setup()
  await task.run('status', ['my-task', 'drafted'])
  expect(on(store).status).toBe('drafted')
  await expect(task.run('status', ['my-task', 'done'])).rejects.toThrow() // can't skip drafted→done
  await expect(task.run('set', ['my-task', 'status', 'done'])).rejects.toThrow(/reserved/)
  await task.run('set', ['my-task', 'title', 'Renamed'])
  expect(on(store).title).toBe('Renamed')
})

// a3 — an open concern blocks done; phases must be terminal
test('done requires no open concern + every phase terminal', async () => {
  const node = taskNode({
    status: 'wrap',
    phases: [{ name: 'P', slug: 'p1', status: 'done' }],
  })
  const { task, store } = setup(node)
  await task.run('concern-add', ['my-task', 'check perf', 'high'])
  await expect(task.run('status', ['my-task', 'done'])).rejects.toThrow(/concern/i)
  await task.run('concern-resolve', ['my-task', 'c1', 'fine', 'user'])
  await task.run('status', ['my-task', 'done'])
  expect(on(store).status).toBe('done')
})

// a4 — phase existence: add (rejects dup) + next-phase
test('add-phase + next-phase (parent owns child existence)', async () => {
  const { task } = setup()
  await task.run('add-phase', ['my-task', 'setup', 'Setup'])
  expect(((await task.run('next-phase', ['my-task'])) as { slug: string }).slug).toBe('setup')
  await expect(task.run('add-phase', ['my-task', 'setup'])).rejects.toThrow(/already exists/)
  expect(task.verbs()).toContain('add-phase')
})

// a5 — archive + reset + unknown verb
test('archive/reset go through the store; unknown verb throws', async () => {
  const { task, store } = setup()
  await task.run('archive', ['my-task'])
  expect(store.disk.has('my-task')).toBe(false)
  await expect(task.run('frobnicate', ['my-task'])).rejects.toThrow(/no verb/)
})
