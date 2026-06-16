import { test, expect } from 'bun:test'
import { createPhase } from './phase.js'
import { createFakeStore } from '../../services/store/store.fake.js'
import { TaskNodeSchema } from '../task/task.schemas.js'
import type { Node } from '../../lib/contracts/store.js'

type Ac = {
  id: string
  text?: string
  status: string
  evidence?: string[]
  failures?: string[]
  reason?: string
}
type Phase = { slug: string; status: string; acceptance_criteria?: Ac[]; rules?: unknown[] }

function taskWith(phase: Partial<Phase> = {}): Node {
  return {
    schema_version: 2,
    slug: 'my-epic/login',
    title: 'T',
    status: 'build',
    phases: [
      { name: 'Setup', slug: 'setup', status: 'pending', acceptance_criteria: [], ...phase },
    ],
  }
}
function setup(phase: Partial<Phase> = {}) {
  const store = createFakeStore({ 'my-epic/login': taskWith(phase) })
  return { store, phase: createPhase({ store, taskSchema: TaskNodeSchema }) }
}
const PH = 'my-epic/login/setup'
const onPhase = (store: ReturnType<typeof createFakeStore>) =>
  (store.disk.get('my-epic/login') as { phases: Phase[] }).phases[0]!

// a1 — get returns the embedded phase; a bad slug (no parent) is rejected
test('get returns the phase; a parentless slug is rejected', async () => {
  const { phase } = setup()
  expect(((await phase.get(PH)) as Phase).slug).toBe('setup')
  await expect(phase.run('status', ['flat'])).rejects.toThrow(/phase slug/)
})

// a2 — ac add (auto-id) → ac evidence flips it done with proof → phase can reach done
test('ac lifecycle: add → evidence (done) → phase status done', async () => {
  const { store, phase } = setup()
  await phase.run('ac', ['add', PH, 'every handler validated'])
  expect(onPhase(store).acceptance_criteria![0]!.id).toBe('a1')
  await phase.run('status', [PH, 'in-progress'])
  // can't finish while the AC is still pending
  await expect(phase.run('status', [PH, 'done'])).rejects.toThrow(/not terminal/)
  await phase.run('ac', ['evidence', PH, 'a1', 'src/x.ts:1 — proof'])
  expect(onPhase(store).acceptance_criteria![0]).toMatchObject({
    status: 'done',
    evidence: ['src/x.ts:1 — proof'],
  })
  await phase.run('status', [PH, 'done'])
  expect(onPhase(store).status).toBe('done')
})

// a3 — ac fail flips back to pending with a reason; ac done w/o evidence is refused by the schema
test('ac fail records the rejection; a bare ac done without evidence is refused', async () => {
  const { store, phase } = setup({
    acceptance_criteria: [{ id: 'a1', text: 't', status: 'pending' }],
  })
  await phase.run('ac', ['fail', PH, 'a1', 'gate red: 2 tests'])
  expect(onPhase(store).acceptance_criteria![0]).toMatchObject({
    status: 'pending',
    failures: ['gate red: 2 tests'],
  })
  await expect(phase.run('ac', ['done', PH, 'a1'])).rejects.toThrow() // schema: done needs evidence
})

// a3b — ac defer records a reason + makes the AC terminal so the phase can reach done; the
// schema refuses a deferred AC with no reason.
test('ac defer: a documented deferral is terminal and does not block phase done', async () => {
  const { store, phase } = setup({
    acceptance_criteria: [{ id: 'a1', text: 't', status: 'pending' }],
  })
  await phase.run('status', [PH, 'in-progress'])
  await phase.run('ac', ['defer', PH, 'a1', 'depends on the billing epic — out of scope here'])
  expect(onPhase(store).acceptance_criteria![0]).toMatchObject({
    status: 'deferred',
    reason: 'depends on the billing epic — out of scope here',
  })
  // deferred is terminal → the phase can finish
  await phase.run('status', [PH, 'done'])
  expect(onPhase(store).status).toBe('done')
})

// a3c — C1: ac set <id> text edits an AC's wording (status/evidence untouched); only `text` is
// settable, and empty text is refused.
test('ac set <id> text edits wording; non-text field + empty text are refused', async () => {
  const { store, phase } = setup({
    acceptance_criteria: [{ id: 'a1', text: 'old wording', status: 'pending' }],
  })
  await phase.run('ac', ['set', PH, 'a1', 'text', 'a sharper, correct wording'])
  expect(onPhase(store).acceptance_criteria![0]).toMatchObject({
    id: 'a1',
    text: 'a sharper, correct wording',
    status: 'pending',
  })
  await expect(phase.run('ac', ['set', PH, 'a1', 'status', 'done'])).rejects.toThrow(/settable/)
  await expect(phase.run('ac', ['set', PH, 'a1', 'text', ''])).rejects.toThrow(/empty/)
})

// a4 — rule add (dedup by path); a phase has no `execute` field (A1: dropped)
test('rule add dedups by path; no execute field (sequential leaf)', async () => {
  const { store, phase } = setup()
  await phase.run('rule', ['add', PH, 'src/x.ts', 'why-1'])
  await phase.run('rule', ['add', PH, 'src/x.ts', 'why-2']) // replace, not duplicate
  expect(onPhase(store).rules).toHaveLength(1)
  // execute is gone — there is no verb for it and the schema rejects the field on write.
  await expect(phase.run('set', [PH, 'execute', 'workflow'])).rejects.toThrow()
})

// a6 — ac list returns the criteria array; ac get returns one by id (UnknownAc when absent)
test('ac list returns the array; ac get returns one by id, else UnknownAc', async () => {
  const { phase } = setup({
    acceptance_criteria: [
      { id: 'a1', text: 'first', status: 'pending' },
      { id: 'a2', text: 'second', status: 'done', evidence: ['p'] },
    ],
  })
  const list = (await phase.run('ac', ['list', PH])) as Ac[]
  expect(list.map((a) => a.id)).toEqual(['a1', 'a2'])
  expect((await phase.run('ac', ['get', PH, 'a2'])) as Ac).toMatchObject({
    id: 'a2',
    status: 'done',
  })
  await expect(phase.run('ac', ['get', PH, 'a9'])).rejects.toThrow(/no acceptance criterion 'a9'/)
})

// a7 — rule list returns the rules array; rule get returns one by its key (path), else UnknownRule
test('rule list returns the array; rule get returns one by path, else UnknownRule', async () => {
  const { phase } = setup({
    rules: [
      { path: 'src/x.ts', why: 'why-x' },
      { path: 'src/y.ts', why: 'why-y' },
    ],
  })
  const list = (await phase.run('rule', ['list', PH])) as { path: string }[]
  expect(list.map((r) => r.path)).toEqual(['src/x.ts', 'src/y.ts'])
  expect((await phase.run('rule', ['get', PH, 'src/y.ts'])) as { why: string }).toMatchObject({
    path: 'src/y.ts',
    why: 'why-y',
  })
  await expect(phase.run('rule', ['get', PH, 'src/z.ts'])).rejects.toThrow(/no rule 'src\/z.ts'/)
})

// a5 — set depends_on records the inter-phase dependency graph (for multi-phase fan-out)
test('set depends_on parses a comma list into depends_on', async () => {
  const { store, phase } = setup()
  await phase.run('set', [PH, 'depends_on', 'css-tokens, markup'])
  expect((onPhase(store) as { depends_on?: string[] }).depends_on).toEqual(['css-tokens', 'markup'])
})
