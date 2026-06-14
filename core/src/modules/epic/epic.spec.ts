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
type StubAc = { id: string; status: string; evidence?: string[]; failures?: string[] }
type EpicDisk = {
  status: string
  tasks: { slug: string; status: string; acceptance_criteria?: StubAc[] }[]
  acceptance: { id: string; status: string; evidence?: string[]; reason?: string }[]
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

// a1b — per-stub outcome ACs: add → evidence flips them done → that unblocks child-status done;
// a stub can't go done while a stub-AC is unbacked, and fail reverts an AC to pending.
test('stub outcome ACs gate child-status done', async () => {
  const { epic, store } = setup()
  await epic.run('child-add', ['my-epic', 'login', 'build login'])
  await epic.run('child-ac-add', ['my-epic', 'login', 'auth handler tested'])
  expect(on(store).tasks[0]!.acceptance_criteria![0]).toMatchObject({ id: 'a1', status: 'pending' })

  // stub can't be done while its AC is open
  await expect(epic.run('child-status', ['my-epic', 'login', 'done'])).rejects.toThrow(
    /ACs not terminal/,
  )

  // fail records the why + keeps it pending; evidence then flips it done
  await epic.run('child-ac-fail', ['my-epic', 'login', 'a1', 'no test yet'])
  expect(on(store).tasks[0]!.acceptance_criteria![0]).toMatchObject({ status: 'pending' })
  await epic.run('child-ac-evidence', ['my-epic', 'login', 'a1', 'src/login.ts — tested'])
  const ac = on(store).tasks[0]!.acceptance_criteria![0] as { status: string; evidence?: string[] }
  expect(ac).toMatchObject({ status: 'done', evidence: ['src/login.ts — tested'] })

  // now the stub goes done
  await epic.run('child-status', ['my-epic', 'login', 'done'])
  expect(on(store).tasks[0]!.status).toBe('done')
})

// a1c — a deferred stub-AC is terminal (documented reason) → does not block child-status done
test('child-ac-defer: a documented deferral unblocks the stub', async () => {
  const { epic, store } = setup()
  await epic.run('child-add', ['my-epic', 'login', 'build login'])
  await epic.run('child-ac-add', ['my-epic', 'login', 'rate-limiting'])
  await epic.run('child-ac-defer', ['my-epic', 'login', 'a1', 'moved to the hardening epic'])
  expect(on(store).tasks[0]!.acceptance_criteria![0]).toMatchObject({
    status: 'deferred',
    reason: 'moved to the hardening epic',
  })
  await epic.run('child-status', ['my-epic', 'login', 'done'])
  expect(on(store).tasks[0]!.status).toBe('done')
})

// a1d — the →build gate also guards the epic tier
test('open questions block the epic advance to build', async () => {
  const { epic } = setup(epicNode({ status: 'drafted' }))
  await epic.run('question-add', ['my-epic', 'monolith or service?', 'high'])
  await expect(epic.run('status', ['my-epic', 'build'])).rejects.toThrow(/open question/i)
  await epic.run('question-resolve', ['my-epic', 'q1', 'service', 'user'])
  await epic.run('status', ['my-epic', 'build'])
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

// a2b — a DoD item can be DEFERRED with a reason (and not without one); deferred is terminal
test('DoD item: deferral needs a reason and then does not block epic done', async () => {
  const node = epicNode({
    status: 'wrap',
    tasks: [{ slug: 'login', status: 'done' }],
    acceptance: [{ id: 'e1', text: 'nice-to-have', status: 'pending' }],
  })
  const { epic, store } = setup(node)
  await expect(epic.run('set-acceptance-status', ['my-epic', 'e1', 'deferred'])).rejects.toThrow(
    /reason/,
  )
  await epic.run('set-acceptance-status', ['my-epic', 'e1', 'deferred', 'pushed to the next epic'])
  expect(on(store).acceptance[0]).toMatchObject({
    status: 'deferred',
    reason: 'pushed to the next epic',
  })
  // deferred DoD item is terminal → the epic can finish
  await epic.run('status', ['my-epic', 'done'])
  expect(on(store).status).toBe('done')
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
