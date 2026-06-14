import { test, expect } from 'bun:test'
import { createEpic } from './epic.js'
import { createFakeStore } from '../../services/store/store.fake.js'
import type { TemplatePort } from '../../lib/contracts/template.js'
import type { Tier } from '../../lib/contracts/tier.js'
import type { Node } from '../../lib/contracts/store.js'

const template: TemplatePort = {
  steps: (tier, stage) => ({ tier, stage, steps: [] }),
  fields: () => ({}),
  validate: () => ({}),
  raw: () => ({}),
}
const fakeTask = (statuses: Record<string, string> = {}): Tier => ({
  tier: 'task',
  verbs: () => ['get'],
  get: async (slug: string) => ({ slug, status: statuses[slug] ?? 'plan' }),
  run: async () => ({}),
})

function epicNode(over: Partial<Node> = {}): Node {
  return {
    schema_version: 2,
    slug: 'my-epic',
    title: 'E',
    status: 'plan',
    tasks: [],
    acceptance: [],
    ...over,
  }
}
function setup(node: Node = epicNode(), task = fakeTask()) {
  const store = createFakeStore({ 'my-epic': node })
  return { store, epic: createEpic({ store, template, task }) }
}
type EpicDisk = {
  status: string
  tasks: { slug: string; status: string }[]
  acceptance: { id: string; status: string; evidence?: string[] }[]
}
const on = (store: ReturnType<typeof createFakeStore>) =>
  store.disk.get('my-epic') as unknown as EpicDisk

// a1 — task-stub existence: add → next; child-status is enum-guarded (no phase 'in-progress')
test('task-stub add/next + enum-guarded child-status', async () => {
  const { epic, store } = setup()
  await epic.run('child-add', ['my-epic', 'login', 'build login'])
  expect(((await epic.run('child-next', ['my-epic'])) as { slug: string }).slug).toBe('login')
  await expect(epic.run('child-status', ['my-epic', 'login', 'in-progress'])).rejects.toThrow(
    /valid task-stub/,
  )
  await epic.run('child-status', ['my-epic', 'login', 'active'])
  expect(on(store).tasks[0]!.status).toBe('active')
})

// a2 — DoD acceptance items: add (auto e-id) + done requires delivery evidence
test('acceptance items: add + done needs evidence', async () => {
  const { epic, store } = setup()
  await epic.run('add-acceptance', ['my-epic', 'login works end to end'])
  expect(on(store).acceptance[0]!.id).toBe('e1')
  await expect(epic.run('set-acceptance-status', ['my-epic', 'e1', 'done'])).rejects.toThrow(
    /evidence/,
  )
  await epic.run('set-acceptance-status', ['my-epic', 'e1', 'done', 'login/auth — delivered'])
  expect(on(store).acceptance[0]).toMatchObject({
    status: 'done',
    evidence: ['login/auth — delivered'],
  })
})

// a3 — status done is guarded: every stub done + every acceptance done + no open concern
test('done floor: stubs + acceptance + concerns', async () => {
  const node = epicNode({
    status: 'wrap',
    tasks: [{ slug: 'login', status: 'done' }],
    acceptance: [{ id: 'e1', text: 't', status: 'done', evidence: ['x — y'] }],
  })
  const { epic, store } = setup(node)
  await epic.run('concern-add', ['my-epic', 'check rollout', 'high'])
  await expect(epic.run('status', ['my-epic', 'done'])).rejects.toThrow(/concern/i)
  await epic.run('concern-resolve', ['my-epic', 'c1', 'ok', 'user'])
  await epic.run('status', ['my-epic', 'done'])
  expect(on(store).status).toBe('done')
})

// a4 — roll-up reads each stub's child TASK file via the injected task module
test('roll-up reports each child task status', async () => {
  const node = epicNode({ tasks: [{ slug: 'login', status: 'active' }] })
  const { epic } = setup(node, fakeTask({ 'my-epic/login': 'done' }))
  const r = (await epic.run('roll-up', ['my-epic'])) as {
    children: { slug: string; stubStatus: string; childStatus: string }[]
  }
  expect(r.children[0]).toEqual({ slug: 'login', stubStatus: 'active', childStatus: 'done' })
})
