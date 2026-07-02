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
// the injected task double. `archived` records every `task archive <slug>` call (C2 cascade);
// `missing` names child slugs whose archive throws (already gone — the cascade tolerates it).
const fakeTask = (
  statuses: Record<string, string> = {},
  archived: string[] = [],
  missing: string[] = [],
): Tier => ({
  tier: 'task',
  verbs: () => ['get', 'archive'],
  get: async (slug: string) => ({ slug, status: statuses[slug] ?? 'plan' }),
  run: async (verb: string, args: string[]) => {
    if (verb === 'archive') {
      const childSlug = args[0]!
      if (missing.includes(childSlug)) throw new Error(`no node '${childSlug}'`)
      archived.push(childSlug)
      return { slug: childSlug, archived: true }
    }
    return {}
  },
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

// a1 — task-stub existence: child add → child next; child status is enum-guarded (no 'in-progress')
test('task-stub child add/next + enum-guarded child status', async () => {
  const { epic, store } = setup()
  await epic.run('child', ['add', 'my-epic', 'login', 'build login'])
  expect(((await epic.run('child', ['next', 'my-epic'])) as { slug: string }).slug).toBe('login')
  await expect(epic.run('child', ['status', 'my-epic', 'login', 'in-progress'])).rejects.toThrow(
    /valid task-stub/,
  )
  await epic.run('child', ['status', 'my-epic', 'login', 'active'])
  expect(on(store).tasks[0]!.status).toBe('active')
})

// a1d — the 4th `child add` arg is the depends_on edge (comma-separated, same parsing as
// `child set depends_on`) and PERSISTS at add-time; child next honors the persisted order.
test('child add persists the depends_on argument', async () => {
  const { epic, store } = setup()
  await epic.run('child', ['add', 'my-epic', 'login', 'build login'])
  await epic.run('child', ['add', 'my-epic', 'profile', 'build profile', 'login'])
  await epic.run('child', ['add', 'my-epic', 'admin', 'build admin', 'login, profile'])
  const tasks = on(store).tasks as { slug: string; depends_on?: string[] }[]
  expect(tasks[0]!.depends_on).toBeUndefined()
  expect(tasks[1]!.depends_on).toEqual(['login'])
  expect(tasks[2]!.depends_on).toEqual(['login', 'profile'])
  // the persisted edge drives the loop: profile only becomes next once login is done
  expect(((await epic.run('child', ['next', 'my-epic'])) as { slug: string }).slug).toBe('login')
  await epic.run('child', ['status', 'my-epic', 'login', 'done'])
  expect(((await epic.run('child', ['next', 'my-epic'])) as { slug: string }).slug).toBe('profile')
})

// a1b — B1: per-stub outcome ACs DOCUMENT outcomes but no longer GATE `child status done`. A
// stub goes done by the all-phases-done rule even with an open outcome AC; the outcomes are
// verified at roll-up/wrap. fail/evidence still mutate the AC.
test('B1: stub outcome ACs do not block child status done; fail/evidence still work', async () => {
  const { epic, store } = setup()
  await epic.run('child', ['add', 'my-epic', 'login', 'build login'])
  await epic.run('child', ['ac', 'add', 'my-epic', 'login', 'auth handler tested'])
  expect(on(store).tasks[0]!.acceptance_criteria![0]).toMatchObject({ id: 'a1', status: 'pending' })

  // B1: the stub can be marked done even while its outcome AC is still open
  await epic.run('child', ['status', 'my-epic', 'login', 'done'])
  expect(on(store).tasks[0]!.status).toBe('done')

  // fail records the why + keeps it pending; evidence then flips it done (the verbs still work)
  await epic.run('child', ['ac', 'fail', 'my-epic', 'login', 'a1', 'no test yet'])
  expect(on(store).tasks[0]!.acceptance_criteria![0]).toMatchObject({ status: 'pending' })
  await epic.run('child', ['ac', 'evidence', 'my-epic', 'login', 'a1', 'src/login.ts — tested'])
  const ac = on(store).tasks[0]!.acceptance_criteria![0] as { status: string; evidence?: string[] }
  expect(ac).toMatchObject({ status: 'done', evidence: ['src/login.ts — tested'] })
})

// a1c — child ac defer records a documented reason (still a usable verb post-B1)
test('child ac defer records a documented deferral on the stub AC', async () => {
  const { epic, store } = setup()
  await epic.run('child', ['add', 'my-epic', 'login', 'build login'])
  await epic.run('child', ['ac', 'add', 'my-epic', 'login', 'rate-limiting'])
  await epic.run('child', ['ac', 'defer', 'my-epic', 'login', 'a1', 'moved to the hardening epic'])
  expect(on(store).tasks[0]!.acceptance_criteria![0]).toMatchObject({
    status: 'deferred',
    reason: 'moved to the hardening epic',
  })
  await epic.run('child', ['status', 'my-epic', 'login', 'done'])
  expect(on(store).tasks[0]!.status).toBe('done')
})

// a1c2 — the nested child-ac sub-collection has the same read side: list returns a stub's
// outcome ACs, get fetches one by id (and throws on a missing child / missing AC).
test('child ac list/get read a stub outcome ACs; get throws on a missing id', async () => {
  const { epic } = setup()
  await epic.run('child', ['add', 'my-epic', 'login', 'build login'])
  await epic.run('child', ['ac', 'add', 'my-epic', 'login', 'auth handler tested'])
  await epic.run('child', ['ac', 'add', 'my-epic', 'login', 'session expiry tested'])

  const list = (await epic.run('child', ['ac', 'list', 'my-epic', 'login'])) as { id: string }[]
  expect(list.map((a) => a.id)).toEqual(['a1', 'a2'])

  const one = (await epic.run('child', ['ac', 'get', 'my-epic', 'login', 'a2'])) as { text: string }
  expect(one.text).toBe('session expiry tested')

  await expect(epic.run('child', ['ac', 'get', 'my-epic', 'login', 'a9'])).rejects.toThrow(
    /no acceptance criterion 'a9'/,
  )
  await expect(epic.run('child', ['ac', 'list', 'my-epic', 'ghost'])).rejects.toThrow(
    /no child 'ghost'/,
  )
})

// a1d — the →build gate also guards the epic tier
test('open questions block the epic advance to build', async () => {
  const { epic } = setup(epicNode({ status: 'drafted' }))
  await epic.run('question', ['add', 'my-epic', 'monolith or service?', 'high'])
  await expect(epic.run('status', ['my-epic', 'build'])).rejects.toThrow(/open question/i)
  await epic.run('question', ['resolve', 'my-epic', 'q1', 'service', 'user'])
  await epic.run('status', ['my-epic', 'build'])
})

// a1e — C6: the question collection has a read side — list returns the array, get returns one by
// id (and errors on an unknown id), so the refine walk reads open questions without python.
test('C6: question list returns the array, get fetches one by id', async () => {
  const { epic } = setup()
  await epic.run('question', ['add', 'my-epic', 'monolith or service?', 'high'])
  await epic.run('question', ['add', 'my-epic', 'which datastore?', 'low'])
  const list = (await epic.run('question', ['list', 'my-epic'])) as { id: string; text: string }[]
  expect(list.map((q) => q.id)).toEqual(['q1', 'q2'])
  const q = (await epic.run('question', ['get', 'my-epic', 'q2'])) as { text: string }
  expect(q.text).toBe('which datastore?')
  await expect(epic.run('question', ['get', 'my-epic', 'q9'])).rejects.toThrow(/no question 'q9'/)
})

// a1f — the child collection mirrors the question read side — list returns the stubs array, get
// returns one stub by its slug (and errors on an unknown slug).
test('child list returns the stubs, get fetches one by slug', async () => {
  const { epic } = setup()
  await epic.run('child', ['add', 'my-epic', 'login', 'build login'])
  await epic.run('child', ['add', 'my-epic', 'logout', 'build logout'])
  const list = (await epic.run('child', ['list', 'my-epic'])) as { slug: string }[]
  expect(list.map((s) => s.slug)).toEqual(['login', 'logout'])
  const stub = (await epic.run('child', ['get', 'my-epic', 'logout'])) as { goal: string }
  expect(stub.goal).toBe('build logout')
  await expect(epic.run('child', ['get', 'my-epic', 'nope'])).rejects.toThrow(/no child 'nope'/)
})

// a1g — the acceptance collection read side — list returns the array, get fetches one by id.
test('acceptance list returns the items, get fetches one by id', async () => {
  const { epic } = setup()
  await epic.run('acceptance', ['add', 'my-epic', 'login works end to end'])
  await epic.run('acceptance', ['add', 'my-epic', 'logout works'])
  const list = (await epic.run('acceptance', ['list', 'my-epic'])) as { id: string }[]
  expect(list.map((a) => a.id)).toEqual(['e1', 'e2'])
  const item = (await epic.run('acceptance', ['get', 'my-epic', 'e2'])) as { text: string }
  expect(item.text).toBe('logout works')
  await expect(epic.run('acceptance', ['get', 'my-epic', 'e9'])).rejects.toThrow(
    /no acceptance item 'e9'/,
  )
})

// a1h — the concern collection read side — list returns the array, get fetches one by id.
test('concern list returns the concerns, get fetches one by id', async () => {
  const { epic } = setup()
  await epic.run('concern', ['add', 'my-epic', 'check rollout', 'high'])
  await epic.run('concern', ['add', 'my-epic', 'check metrics', 'low'])
  const list = (await epic.run('concern', ['list', 'my-epic'])) as { id: string; text: string }[]
  expect(list.map((c) => c.id)).toEqual(['c1', 'c2'])
  const c = (await epic.run('concern', ['get', 'my-epic', 'c2'])) as { text: string }
  expect(c.text).toBe('check metrics')
  await expect(epic.run('concern', ['get', 'my-epic', 'c9'])).rejects.toThrow(/no concern 'c9'/)
})

// a1i — the log collection has a read side too — list returns the entries (no get; entries have no id).
test('log list returns the entries', async () => {
  const { epic } = setup()
  await epic.run('log', ['add', 'my-epic', '2026-06-16', 'note', 'kicked off'])
  await epic.run('log', ['add', 'my-epic', '2026-06-16', 'note', 'first child planned'])
  const list = (await epic.run('log', ['list', 'my-epic'])) as { note: string }[]
  expect(list.map((e) => e.note)).toEqual(['kicked off', 'first child planned'])
})

// a2 — DoD acceptance items: acceptance add (auto e-id) + acceptance status done needs evidence
test('acceptance items: add + status done needs evidence', async () => {
  const { epic, store } = setup()
  await epic.run('acceptance', ['add', 'my-epic', 'login works end to end'])
  expect(on(store).acceptance[0]!.id).toBe('e1')
  await expect(epic.run('acceptance', ['status', 'my-epic', 'e1', 'done'])).rejects.toThrow(
    /evidence/,
  )
  await epic.run('acceptance', ['status', 'my-epic', 'e1', 'done', 'login/auth — delivered'])
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
  await expect(epic.run('acceptance', ['status', 'my-epic', 'e1', 'deferred'])).rejects.toThrow(
    /reason/,
  )
  await epic.run('acceptance', ['status', 'my-epic', 'e1', 'deferred', 'pushed to the next epic'])
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
  await epic.run('concern', ['add', 'my-epic', 'check rollout', 'high'])
  await expect(epic.run('status', ['my-epic', 'done'])).rejects.toThrow(/concern/i)
  await epic.run('concern', ['resolve', 'my-epic', 'c1', 'ok', 'user'])
  await epic.run('status', ['my-epic', 'done'])
  expect(on(store).status).toBe('done')
})

// a4 — child roll-up reads each stub's child TASK file via the injected task module
test('child roll-up reports each child task status', async () => {
  const node = epicNode({ tasks: [{ slug: 'login', status: 'active' }] })
  const { epic } = setup(node, fakeTask({ 'my-epic/login': 'done' }))
  const r = (await epic.run('child', ['roll-up', 'my-epic'])) as {
    children: { slug: string; stubStatus: string; childStatus: string }[]
  }
  expect(r.children[0]).toEqual({ slug: 'login', stubStatus: 'active', childStatus: 'done' })
})

// a5 — C5: epic set writes a nested context trail correctly (context.refine), not a flat key
test('C5: epic set writes context.refine into the nested trail', async () => {
  const { epic, store } = setup()
  await epic.run('set', ['my-epic', 'context.refine', 'reviewed the auth design with the team'])
  const disk = store.disk.get('my-epic') as {
    context?: { refine?: string }
    'context.refine'?: unknown
  }
  expect(disk.context?.refine).toBe('reviewed the auth design with the team')
  expect('context.refine' in disk).toBe(false) // not a literal flat key
})

// a6 — C2: epic archive CASCADES — it archives each delivered (done) child task-file through the
// injected task module's validated path, then moves the epic node. Active children are untouched.
test('C2: epic archive cascades to delivered child task-files', async () => {
  const node = epicNode({
    tasks: [
      { slug: 'login', status: 'done' },
      { slug: 'profile', status: 'done' },
      { slug: 'logout', status: 'active' },
    ],
  })
  const archived: string[] = []
  const { epic, store } = setup(node, fakeTask({}, archived))
  const r = (await epic.run('archive', ['my-epic'])) as { archived: boolean; children: string[] }
  expect(r.archived).toBe(true)
  expect(r.children).toEqual(['login', 'profile']) // only the delivered children
  expect(archived).toEqual(['login', 'profile']) // each routed through task archive
  expect(store.disk.has('my-epic')).toBe(false)
})

// a6b — C2: a child whose file is already gone (moved with the epic folder) is tolerated — the
// cascade is best-effort per child and the epic archive itself still completes.
test('C2: epic archive tolerates a child already gone, still archives the epic', async () => {
  const node = epicNode({
    tasks: [
      { slug: 'login', status: 'done' },
      { slug: 'profile', status: 'done' },
    ],
  })
  const archived: string[] = []
  const { epic, store } = setup(node, fakeTask({}, archived, ['profile']))
  const r = (await epic.run('archive', ['my-epic'])) as { archived: boolean; children: string[] }
  expect(r.archived).toBe(true)
  expect(r.children).toEqual(['login']) // profile's file was gone → not listed, but no throw
  expect(archived).toEqual(['login'])
  expect(store.disk.has('my-epic')).toBe(false)
})

// a9 — step enforcement (epic): plan→drafted requires a receipt per served plan step;
// step done/skip record them on the epic node.
test('epic stage-closing transition gates on step receipts', async () => {
  const planTemplate: TemplatePort = {
    steps: (tier, stage) => ({
      tier,
      stage,
      steps: stage === 'plan' ? [{ name: 'discover' }, { name: 'scaffold' }] : [],
    }),
    fields: () => ({}),
    validate: () => ({}),
    raw: () => ({}),
  }
  const store = createFakeStore({ 'my-epic': epicNode() })
  const epic = createEpic({ store, template: planTemplate, task: fakeTask() })
  await expect(epic.run('status', ['my-epic', 'drafted'])).rejects.toThrow(/discover, scaffold/)
  await epic.run('step', ['done', 'my-epic', 'plan', 'discover', 'codebase scanned'])
  await epic.run('step', ['skip', 'my-epic', 'plan', 'scaffold', 'stubs hand-written by the user'])
  await epic.run('status', ['my-epic', 'drafted'])
  expect((store.disk.get('my-epic') as { status: string }).status).toBe('drafted')
  await expect(epic.run('set', ['my-epic', 'steps_run', 'x'])).rejects.toThrow(/reserved/)
})
