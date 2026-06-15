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
    steps: [{ name: 'implement', use: { type: 'agent', name: 'build-implement' } }],
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
    steps: { use?: { name?: string } }[]
    node: TaskNode
  }
  expect(plan.stage).toBe('build')
  expect(plan.steps[0]!.use?.name).toBe('build-implement')
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

// a2b — the →build gate: an open question blocks advancing into build (with a listing message);
// resolving it opens the door (requirements-3 §5).
test('open questions block the advance to build', async () => {
  const node = taskNode({ status: 'drafted' })
  const { task, store } = setup(node)
  await task.run('question-add', ['my-task', 'which auth provider?', 'high'])
  await expect(task.run('status', ['my-task', 'build'])).rejects.toThrow(/open question/i)
  await task.run('question-resolve', ['my-task', 'q1', 'OAuth', 'user'])
  await task.run('status', ['my-task', 'build'])
  expect(on(store).status).toBe('build')
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

// a4b — ready-phases honours phase depends_on (the multi-phase fan-out level): independent
// phases are ready together, a phase with unmet deps waits.
test('ready-phases honours phase depends_on', async () => {
  const node = taskNode({
    status: 'build',
    phases: [
      { name: 'A', slug: 'css', status: 'pending' },
      { name: 'B', slug: 'markup', status: 'pending' },
      { name: 'C', slug: 'logic', status: 'pending', depends_on: ['css', 'markup'] },
    ],
  })
  const { task } = setup(node)
  const ready = (await task.run('ready-phases', ['my-task'])) as { slug: string }[]
  expect(ready.map((p) => p.slug)).toEqual(['css', 'markup']) // logic waits on its deps
})

// a5 — archive + reset + unknown verb
test('archive/reset go through the store; unknown verb throws', async () => {
  const { task, store } = setup()
  await task.run('archive', ['my-task'])
  expect(store.disk.has('my-task')).toBe(false)
  await expect(task.run('frobnicate', ['my-task'])).rejects.toThrow(/no verb/)
})
