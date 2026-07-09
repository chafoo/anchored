import { describe, test, expect, beforeEach } from 'bun:test'
import { createRun } from './run.js'
import { createFakeStore, type FakeStore } from '../../services/store/store.fake.js'
import { createFakeConfig } from '../../services/config/config.fake.js'
import type { RunPort } from '../../lib/contracts/run.js'
import type { AnchoredError } from '../../lib/utils/error.js'
import type { RunFile } from './run.schemas.js'

let tick: number
let store: FakeStore
let run: RunPort

const config = createFakeConfig({
  fields: { commit: 'string', coverage_pct: 'number' },
  defaults: { validator: { instructions: 'ground evidence' } },
  setups: {
    frontend: { before: { instructions: 'run lint' } },
    backend: { validator: { instructions: 'real test runs' } },
    release: { validator: { instructions: 'reject on doubt', require: 'grounded' } },
  },
})

const onDisk = (slug: string) => store.disk.get(slug) as unknown as RunFile

beforeEach(() => {
  tick = 0
  store = createFakeStore()
  run = createRun({
    store,
    config,
    clock: () => `2026-07-08T14:${String(tick++ % 60).padStart(2, '0')}:00Z`,
    rand: () => 'x7k2',
  })
})

const anchorNavbar = () =>
  run.anchor({
    slug: 'fix-navbar',
    goal: 'Navbar overflow fixed',
    plan: 'Accepted plan:\n1. flex layout\n2. viewport test\n',
    rigor: 'high',
    criteria: [
      { text: 'wraps at 375px', setup: 'frontend', gate: 'layout' },
      { text: 'no horizontal scrollbar', setup: 'frontend', gate: 'layout' },
      { text: 'desktop unchanged', setup: 'frontend', gate: 'final' },
    ],
  })

describe('anchor', () => {
  test('mints ids, applies defaults, persists the plan verbatim', async () => {
    await anchorNavbar()
    const r = onDisk('fix-navbar')
    expect(r.criteria.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(r.criteria[0]!.status).toBe('open')
    expect(r.rigor).toBe('high')
    expect(r.plan).toContain('1. flex layout')
    expect(r.amendments).toEqual([])
  })

  test('refuses an existing slug, an invalid slug, an unknown setup, empty criteria', async () => {
    await anchorNavbar()
    expect(anchorNavbar()).rejects.toMatchObject({ kind: 'RunExists' })
    expect(
      run.anchor({ slug: '../evil', goal: 'g', criteria: [{ text: 't' }] }),
    ).rejects.toMatchObject({ kind: 'InvalidSlug' })
    expect(
      run.anchor({ slug: 'r2', goal: 'g', criteria: [{ text: 't', setup: 'nope' }] }),
    ).rejects.toMatchObject({ kind: 'UnknownSetup' })
    expect(run.anchor({ slug: 'r3', goal: 'g', criteria: [] })).rejects.toMatchObject({
      kind: 'NoCriteria',
    })
  })
})

describe('claim', () => {
  test('appends to the trail (with optional refs), never touches criteria', async () => {
    await anchorNavbar()
    await run.claim('fix-navbar', { claim: 'replaced fixed widths', refs: ['c1', 'c2'] })
    const r = onDisk('fix-navbar')
    expect(r.trail).toHaveLength(1)
    expect(r.trail[0]).toMatchObject({ claim: 'replaced fixed widths', refs: ['c1', 'c2'] })
  })
})

describe('validate', () => {
  test('returns the gate packet: criteria, minted snapshot, resolved setup, fields', async () => {
    await anchorNavbar()
    const packet = await run.validate('fix-navbar', { gate: 'layout' })
    expect(packet.criteria.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(packet.snapshot).toMatch(/^snap-2026-07-08T14:0\d:00Z-x7k2$/)
    expect(packet.rigor).toBe('high')
    expect(packet.setup.name).toBe('frontend')
    expect(packet.setup.before?.instructions).toBe('run lint') // setup slot
    expect(packet.setup.validator?.instructions).toBe('ground evidence') // defaults fill
    expect(packet.fields).toEqual({ commit: 'string', coverage_pct: 'number' })
  })

  test('--snapshot overrides the minted token verbatim', async () => {
    await anchorNavbar()
    const packet = await run.validate('fix-navbar', { gate: 'layout', snapshot: '3f2a91c' })
    expect(packet.snapshot).toBe('3f2a91c')
  })

  test('records the validation request in the trail', async () => {
    await anchorNavbar()
    await run.validate('fix-navbar', { gate: 'layout', snapshot: 'abc' })
    const r = onDisk('fix-navbar')
    expect(r.trail[0]!.gate).toBe('layout')
    expect(r.trail[0]!.validated).toBe('requested c1, c2')
    expect(r.trail[0]!.snapshot).toBe('abc')
  })

  test('asking the same gate again reuses the snapshot and adds no trail entry', async () => {
    await anchorNavbar()
    const first = await run.validate('fix-navbar', { gate: 'layout' })
    const again = await run.validate('fix-navbar', { gate: 'layout' })
    expect(again.snapshot).toBe(first.snapshot)
    expect(onDisk('fix-navbar').trail).toHaveLength(1)
  })

  test('another gate is a different request — it gets its own entry', async () => {
    await anchorNavbar()
    const layout = await run.validate('fix-navbar', { gate: 'layout' })
    const final = await run.validate('fix-navbar', { gate: 'final' })
    expect(final.snapshot).not.toBe(layout.snapshot)
    expect(onDisk('fix-navbar').trail).toHaveLength(2)
  })

  test('after a fail, re-validating the gate mints a fresh snapshot', async () => {
    await anchorNavbar()
    const before = await run.validate('fix-navbar', { gate: 'layout' })
    await run.fail('fix-navbar', 'c2', { snapshot: before.snapshot, verdict: 'overflows by 4px' })
    const after = await run.validate('fix-navbar', { gate: 'layout' })
    // c1 is still open, c2 is failed → same selection, but proof was written since
    expect(after.criteria.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(after.snapshot).not.toBe(before.snapshot)
    expect(onDisk('fix-navbar').trail).toHaveLength(2)
  })

  test('proving one criterion changes the selection — a new request', async () => {
    await anchorNavbar()
    const before = await run.validate('fix-navbar', { gate: 'layout' })
    await run.evidence('fix-navbar', 'c1', { snapshot: before.snapshot, grounded: 'bun test, 0' })
    const after = await run.validate('fix-navbar', { gate: 'layout' })
    expect(after.criteria.map((c) => c.id)).toEqual(['c2'])
    expect(after.snapshot).not.toBe(before.snapshot)
  })
})

describe('evidence + fail (the validator verbs)', () => {
  test('evidence flips to done with validator-authored proof', async () => {
    await anchorNavbar()
    await run.evidence('fix-navbar', 'c1', { snapshot: '3f2a91c', grounded: 'bun test, exit 0' })
    const c1 = onDisk('fix-navbar').criteria[0]!
    expect(c1.status).toBe('done')
    expect(c1.evidence).toMatchObject({ by: 'validator', snapshot: '3f2a91c' })
  })

  test('fail flips to failed with a reasoned verdict', async () => {
    await anchorNavbar()
    await run.fail('fix-navbar', 'c2', { snapshot: '3f2a91c', verdict: '768px overflows by 4px' })
    expect(onDisk('fix-navbar').criteria[1]).toMatchObject({
      status: 'failed',
      evidence: { verdict: '768px overflows by 4px' },
    })
  })

  test('evidence without grounded output or verdict never reaches disk (schema)', async () => {
    await anchorNavbar()
    expect(run.evidence('fix-navbar', 'c1', { snapshot: 's' })).rejects.toThrow()
    expect(onDisk('fix-navbar').criteria[0]!.status).toBe('open')
  })

  test('unknown or inactive criteria are refused', async () => {
    await anchorNavbar()
    expect(
      run.evidence('fix-navbar', 'c9', { snapshot: 's', grounded: 'x' }),
    ).rejects.toMatchObject({ kind: 'UnknownCriterion' })
    await run.amend('fix-navbar', { reason: 'obsolete', reject: ['c2'] })
    expect(
      run.evidence('fix-navbar', 'c2', { snapshot: 's', grounded: 'x' }),
    ).rejects.toMatchObject({ kind: 'InactiveCriterion' })
  })

  test('a reasoned verdict proves a criterion where no setup demands execution', async () => {
    await anchorNavbar()
    await run.evidence('fix-navbar', 'c1', {
      snapshot: 's',
      verdict: 'compared the rendered asset against the spec sheet, every measure matches',
    })
    expect(onDisk('fix-navbar').criteria[0]).toMatchObject({ status: 'done' })
  })
})

describe('validator.require: grounded (the one hardening knob, opt-in per setup)', () => {
  const anchorRelease = () =>
    run.anchor({
      slug: 'ship',
      goal: 'ship it',
      criteria: [
        { text: 'the suite passes', setup: 'release', gate: 'g' },
        { text: 'the changelog reads well', setup: 'release', gate: 'g', judgment: true },
      ],
    })

  test('the setup refuses a prose verdict — the criterion stays open', async () => {
    await anchorRelease()
    expect(
      run.evidence('ship', 'c1', { snapshot: 's', verdict: 'I read it, seems fine' }),
    ).rejects.toMatchObject({ kind: 'UngroundedEvidence' })
    expect(onDisk('ship').criteria[0]!.status).toBe('open')
  })

  test('executed output proves it', async () => {
    await anchorRelease()
    await run.evidence('ship', 'c1', { snapshot: 's', grounded: 'bun test → 42 pass, exit 0' })
    expect(onDisk('ship').criteria[0]!.status).toBe('done')
  })

  test('a judgment criterion stays exempt even in a grounded-only setup', async () => {
    await anchorRelease()
    await run.evidence('ship', 'c2', { snapshot: 's', verdict: 'no hype, one clause per line' })
    expect(onDisk('ship').criteria[1]).toMatchObject({ status: 'done' })
  })

  test('the packet tells the validator the setup demands execution', async () => {
    await anchorRelease()
    const packet = await run.validate('ship', { gate: 'g' })
    expect(packet.setup.validator?.require).toBe('grounded')
  })
})

describe('judgment criteria (the one opt-out from grounded-for-done)', () => {
  const anchorCopy = () =>
    run.anchor({
      slug: 'copy',
      goal: 'The empty state reads calm',
      criteria: [
        { text: 'the empty-state copy reads calm', gate: 'copy', judgment: true },
        { text: 'the copy renders', gate: 'copy' },
      ],
    })

  test('anchor persists judgment only where it was declared', async () => {
    await anchorCopy()
    const r = onDisk('copy')
    expect(r.criteria[0]!.judgment).toBe(true)
    expect(r.criteria[1]!.judgment).toBeUndefined()
  })

  test('a prose verdict proves it', async () => {
    await anchorCopy()
    await run.evidence('copy', 'c1', { snapshot: 's', verdict: 'no exclamation marks, one clause' })
    expect(onDisk('copy').criteria[0]).toMatchObject({ status: 'done' })
  })

  test('the packet tells the validator which criteria a verdict may prove', async () => {
    await anchorCopy()
    const packet = await run.validate('copy', { gate: 'copy' })
    expect(packet.criteria[0]).toMatchObject({ id: 'c1', judgment: true })
    expect(packet.criteria[1]!.judgment).toBeUndefined()
  })
})

describe('amend (the course-change verb)', () => {
  test('adds, supersedes (by index) and records the amendment — plan untouched', async () => {
    await anchorNavbar()
    const planBefore = onDisk('fix-navbar').plan
    await run.amend('fix-navbar', {
      reason: 'nav-actions is shared with the footer',
      add: [{ text: 'shared width token', setup: 'frontend', gate: 'layout-2' }],
      supersede: [{ id: 'c2', by: 1 }],
    })
    const r = onDisk('fix-navbar')
    expect(r.plan).toBe(planBefore)
    expect(r.amendments[0]).toMatchObject({ id: 'a1', reason: expect.stringContaining('footer') })
    expect(r.criteria).toHaveLength(4)
    expect(r.criteria[1]).toMatchObject({
      status: 'superseded',
      superseded_by: 'c4',
      amended_by: 'a1',
    })
    expect(r.criteria[3]).toMatchObject({ id: 'c4', added_by: 'a1', status: 'open' })
  })

  test('supersede by existing id + reject', async () => {
    await anchorNavbar()
    await run.amend('fix-navbar', {
      reason: 'c2 duplicates c1; c3 out of scope',
      supersede: [{ id: 'c2', by: 'c1' }],
      reject: ['c3'],
    })
    const r = onDisk('fix-navbar')
    expect(r.criteria[1]).toMatchObject({ status: 'superseded', superseded_by: 'c1' })
    expect(r.criteria[2]).toMatchObject({ status: 'rejected', amended_by: 'a1' })
  })

  test('an empty amendment is refused — a pure note is a claim', async () => {
    await anchorNavbar()
    expect(run.amend('fix-navbar', { reason: 'just thinking' })).rejects.toMatchObject({
      kind: 'EmptyAmendment',
    })
  })
})

describe('set (custom fields)', () => {
  test('coerces per declared type and writes onto the criterion', async () => {
    await anchorNavbar()
    await run.set('fix-navbar', 'c1', 'commit', 'abc123')
    await run.set('fix-navbar', 'c1', 'coverage_pct', '91.5')
    expect(onDisk('fix-navbar').criteria[0]).toMatchObject({ commit: 'abc123', coverage_pct: 91.5 })
  })

  test('an undeclared field is refused', async () => {
    await anchorNavbar()
    expect(run.set('fix-navbar', 'c1', 'ticket', 'X-1')).rejects.toMatchObject({
      kind: 'UnknownField',
    })
  })
})

describe('close (the gate)', () => {
  const proveAll = async () => {
    for (const id of ['c1', 'c2', 'c3'])
      await run.evidence('fix-navbar', id, { snapshot: 's1', grounded: 'test run, exit 0' })
  }

  test('refuses with the blocker list while anything active is unproven', async () => {
    await anchorNavbar()
    await run.evidence('fix-navbar', 'c1', { snapshot: 's1', grounded: 'x' })
    try {
      await run.close('fix-navbar')
      expect.unreachable()
    } catch (e) {
      expect((e as AnchoredError).kind).toBe('CloseBlocked')
      expect((e as AnchoredError).suggestions).toEqual([
        'c2 (open): no horizontal scrollbar',
        'c3 (open): desktop unchanged',
      ])
    }
  })

  test('closes when every active criterion is done; superseded/rejected never block', async () => {
    await anchorNavbar()
    await run.amend('fix-navbar', { reason: 'scope cut', reject: ['c3'] })
    await run.evidence('fix-navbar', 'c1', { snapshot: 's1', grounded: 'x' })
    await run.evidence('fix-navbar', 'c2', { snapshot: 's1', grounded: 'x' })
    await run.close('fix-navbar')
    expect(onDisk('fix-navbar').closed?.at).toBeDefined()
  })

  test('a closed run refuses proof-state verbs but allows claim + set (enrichment)', async () => {
    await anchorNavbar()
    await proveAll()
    await run.close('fix-navbar')
    expect(run.close('fix-navbar')).rejects.toMatchObject({ kind: 'AlreadyClosed' })
    expect(run.amend('fix-navbar', { reason: 'r', reject: ['c1'] })).rejects.toMatchObject({
      kind: 'RunClosed',
    })
    expect(run.fail('fix-navbar', 'c1', { snapshot: 's', verdict: 'v' })).rejects.toMatchObject({
      kind: 'RunClosed',
    })
    expect(run.validate('fix-navbar')).rejects.toMatchObject({ kind: 'RunClosed' })
    await run.claim('fix-navbar', { claim: 'PR opened: #42' })
    await run.set('fix-navbar', 'c1', 'commit', 'abc123')
    const r = onDisk('fix-navbar')
    expect(r.trail.at(-1)!.claim).toBe('PR opened: #42')
    expect(r.criteria[0]).toMatchObject({ commit: 'abc123' })
  })
})

describe('status + list', () => {
  test('list counts how many done criteria rest on a verdict rather than executed output', async () => {
    await anchorNavbar()
    await run.evidence('fix-navbar', 'c1', { snapshot: 's', grounded: 'bun test, exit 0' })
    await run.evidence('fix-navbar', 'c2', { snapshot: 's', verdict: 'inspected, it holds' })
    const [summary] = await run.list()
    expect(summary).toMatchObject({ done: 2, judged: 1 })
  })

  test('status returns the run; list summarizes every run', async () => {
    await anchorNavbar()
    await run.fail('fix-navbar', 'c2', { snapshot: 's', verdict: 'broken' })
    await run.evidence('fix-navbar', 'c1', { snapshot: 's', grounded: 'x' })
    expect((await run.status('fix-navbar'))['goal']).toBe('Navbar overflow fixed')
    expect(await run.list()).toEqual([
      {
        slug: 'fix-navbar',
        goal: 'Navbar overflow fixed',
        rigor: 'high',
        closed: false,
        judged: 0,
        open: 1,
        failed: 1,
        done: 1,
      },
    ])
  })
})
