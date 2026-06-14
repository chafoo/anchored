import { test, expect } from 'bun:test'
import { createProject } from './project.js'
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
const fakeEpic = (statuses: Record<string, string> = {}): Tier => ({
  tier: 'epic',
  verbs: () => ['get'],
  get: async (slug: string) => ({ slug, status: statuses[slug] ?? 'plan' }),
  run: async () => ({}),
})

function projectNode(over: Partial<Node> = {}): Node {
  return {
    schema_version: 2,
    slug: 'my-proj',
    title: 'P',
    status: 'plan',
    epics: [],
    acceptance: [],
    ...over,
  }
}
function setup(node: Node = projectNode(), epic = fakeEpic()) {
  const store = createFakeStore({ 'my-proj': node })
  return { store, project: createProject({ store, template, epic }) }
}
type StubAc = { id: string; status: string; evidence?: string[]; failures?: string[] }
type Disk = {
  status: string
  epics: { slug: string; status: string; acceptance_criteria?: StubAc[] }[]
  acceptance: { id: string; status: string; evidence?: string[]; reason?: string }[]
}
const on = (store: ReturnType<typeof createFakeStore>) =>
  store.disk.get('my-proj') as unknown as Disk

// a1 — epic-stub existence + enum-guarded child-status; roll-up reads child epic files
test('epic-stub add + roll-up via the injected epic module', async () => {
  const { project, store } = setup(projectNode({ epics: [] }), fakeEpic({ auth: 'done' }))
  await project.run('child-add', ['my-proj', 'auth', 'auth system'])
  expect(on(store).epics[0]!.slug).toBe('auth')
  await expect(project.run('child-status', ['my-proj', 'auth', 'in-progress'])).rejects.toThrow(
    /valid epic-stub/,
  )
  const r = (await project.run('roll-up', ['my-proj'])) as {
    children: { slug: string; stubStatus: string; childStatus: string }[]
  }
  expect(r.children[0]).toEqual({ slug: 'auth', stubStatus: 'pending', childStatus: 'done' })
})

// a1b — per-stub outcome ACs gate the epic-stub's child-status done (mirrors epic one tier up)
test('stub outcome ACs gate child-status done', async () => {
  const { project, store } = setup()
  await project.run('child-add', ['my-proj', 'auth', 'auth system'])
  await project.run('child-ac-add', ['my-proj', 'auth', 'auth shipped'])
  await expect(project.run('child-status', ['my-proj', 'auth', 'done'])).rejects.toThrow(
    /ACs not terminal/,
  )
  await project.run('child-ac-evidence', ['my-proj', 'auth', 'a1', 'auth/login — shipped'])
  expect(on(store).epics[0]!.acceptance_criteria![0]).toMatchObject({
    status: 'done',
    evidence: ['auth/login — shipped'],
  })
  await project.run('child-status', ['my-proj', 'auth', 'done'])
  expect(on(store).epics[0]!.status).toBe('done')
})

// a1c — child-ac-defer (deferred terminal) + the →build question gate at the project tier
test('child-ac-defer unblocks the stub; open questions block advance to build', async () => {
  const { project, store } = setup()
  await project.run('child-add', ['my-proj', 'auth', 'auth system'])
  await project.run('child-ac-add', ['my-proj', 'auth', 'SSO'])
  await project.run('child-ac-defer', ['my-proj', 'auth', 'a1', 'phase 2'])
  expect(on(store).epics[0]!.acceptance_criteria![0]).toMatchObject({
    status: 'deferred',
    reason: 'phase 2',
  })
  await project.run('child-status', ['my-proj', 'auth', 'done'])
  expect(on(store).epics[0]!.status).toBe('done')

  const { project: p2 } = setup(projectNode({ status: 'drafted' }))
  await p2.run('question-add', ['my-proj', 'budget?', 'high'])
  await expect(p2.run('status', ['my-proj', 'build'])).rejects.toThrow(/open question/i)
})

// a2 — DoD acceptance needs evidence; done floor checks stubs + acceptance
test('acceptance evidence + status-done floor', async () => {
  const { project, store } = setup()
  await project.run('add-acceptance', ['my-proj', 'project shipped'])
  await expect(project.run('set-acceptance-status', ['my-proj', 'e1', 'done'])).rejects.toThrow(
    /evidence/,
  )
  await project.run('set-acceptance-status', ['my-proj', 'e1', 'done', 'auth — delivered'])
  expect(on(store).acceptance[0]!.status).toBe('done')

  // a DoD item can also be deferred with a reason (and not without one)
  await project.run('add-acceptance', ['my-proj', 'analytics dashboard'])
  await expect(project.run('set-acceptance-status', ['my-proj', 'e2', 'deferred'])).rejects.toThrow(
    /reason/,
  )
  await project.run('set-acceptance-status', ['my-proj', 'e2', 'deferred', 'next quarter'])
  expect(on(store).acceptance[1]).toMatchObject({ status: 'deferred', reason: 'next quarter' })

  // a project on the uniform lifecycle reaches done with stubs + acceptance done
  const node = projectNode({
    status: 'wrap',
    epics: [{ slug: 'auth', status: 'done' }],
    acceptance: [{ id: 'e1', text: 't', status: 'done', evidence: ['x — y'] }],
  })
  const { project: p2, store: s2 } = setup(node)
  await p2.run('status', ['my-proj', 'done'])
  expect((s2.disk.get('my-proj') as unknown as Disk).status).toBe('done')
})
