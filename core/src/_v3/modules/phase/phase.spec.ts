import { test, expect } from 'bun:test'
import { createPhase } from './phase.js'
import { createFakeStore } from '../../services/store/store.fake.js'
import { TaskNodeSchema } from '../task/task.schemas.js'
import type { Node } from '../../lib/contracts/store.js'

type Ac = { id: string; text?: string; status: string; evidence?: string[]; failures?: string[] }
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

// a2 — ac-add (auto-id) → ac-evidence flips it done with proof → phase can reach done
test('ac lifecycle: add → evidence (done) → phase status done', async () => {
  const { store, phase } = setup()
  await phase.run('ac-add', [PH, 'every handler validated'])
  expect(onPhase(store).acceptance_criteria![0]!.id).toBe('a1')
  await phase.run('status', [PH, 'in-progress'])
  // can't finish while the AC is still pending
  await expect(phase.run('status', [PH, 'done'])).rejects.toThrow(/not done/)
  await phase.run('ac-evidence', [PH, 'a1', 'src/x.ts:1 — proof'])
  expect(onPhase(store).acceptance_criteria![0]).toMatchObject({
    status: 'done',
    evidence: ['src/x.ts:1 — proof'],
  })
  await phase.run('status', [PH, 'done'])
  expect(onPhase(store).status).toBe('done')
})

// a3 — ac-fail flips back to pending with a reason; ac-done w/o evidence is refused by the schema
test('ac-fail records the rejection; a bare ac-done without evidence is refused', async () => {
  const { store, phase } = setup({
    acceptance_criteria: [{ id: 'a1', text: 't', status: 'pending' }],
  })
  await phase.run('ac-fail', [PH, 'a1', 'gate red: 2 tests'])
  expect(onPhase(store).acceptance_criteria![0]).toMatchObject({
    status: 'pending',
    failures: ['gate red: 2 tests'],
  })
  await expect(phase.run('ac-done', [PH, 'a1'])).rejects.toThrow() // schema: done needs evidence
})

// a4 — rule-add (dedup by path) + set-executor enum guard
test('rule-add dedups by path; set-executor is enum-guarded', async () => {
  const { store, phase } = setup()
  await phase.run('rule-add', [PH, 'src/x.ts', 'why-1'])
  await phase.run('rule-add', [PH, 'src/x.ts', 'why-2']) // replace, not duplicate
  expect(onPhase(store).rules).toHaveLength(1)
  await phase.run('set-executor', [PH, 'workflow'])
  await expect(phase.run('set-executor', [PH, 'bogus'])).rejects.toThrow(/executor/)
})
