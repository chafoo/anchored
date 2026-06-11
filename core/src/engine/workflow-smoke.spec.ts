import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createEngine } from './engine.js'
import { createNodeOps, type NodeOpsDeps } from '../ops/node-ops.js'
import { taskDescriptor } from '../schema/tiers/task.js'
import { nextChild as realNextChild } from '../ops/scope/children.js'
import type { AnyNode, OpsLike, WorkflowSeam } from './step-runner.js'

// in-memory nodeOps (JSON substrate) — enough to exercise setExecutor + setStatus
function memOps() {
  const store = new Map<string, string>()
  const deps: NodeOpsDeps = {
    io: {
      atomicWrite: async (p, c) => {
        store.set(p, c)
      },
      readFile: async (p) => {
        const d = store.get(p)
        if (d === undefined) throw new Error(`ENOENT ${p}`)
        return d
      },
    },
    render: (n) => JSON.stringify(n),
    parse: (r) => JSON.parse(r),
    pathFor: (slug) => `t/${slug}.yml`,
  }
  return createNodeOps(taskDescriptor, deps)
}

// engine OpsLike that advances child status in-place (sequential path)
function engineOps(): OpsLike {
  return {
    setStatus: async (n) => n,
    nextChild: (n) =>
      realNextChild((n.phases ?? n.tasks ?? []) as { slug: string; status: string }[]),
    setChildStatus: async (n, slug, status) => {
      const children = ((n.phases as { slug: string }[]) ?? []).map((c) =>
        c.slug === slug ? { ...c, status } : c,
      )
      return { ...n, phases: children }
    },
    addQuestion: async (n) => n,
    resolveQuestion: async (n) => n,
    appendLog: async (n) => n,
  }
}

const taskConfig = {
  task: { build: { each: 'phase', mode: 'workflow', retry_limit: 3 } },
  phase: { build: { steps: [{ name: 'implement', use: 'impl' }] } },
}

function freshTask(): AnyNode {
  return {
    schema_version: 2,
    slug: 'wf-smoke',
    title: 'WF smoke',
    status: 'build',
    phases: [
      {
        name: 'P1',
        slug: 'p1',
        status: 'pending',
        acceptance_criteria: [{ id: 'a1', text: 'prove p1', status: 'pending' }],
      },
      {
        name: 'P2',
        slug: 'p2',
        status: 'pending',
        acceptance_criteria: [{ id: 'a1', text: 'prove p2', status: 'pending' }],
      },
    ],
  }
}

// the seam's collect simulates the units' CLI self-write: every phase AC reaches
// done WITH evidence (the evidence-driven completion the loop relies on)
function selfWriteCollect(): WorkflowSeam['collect'] {
  return async (parent) => ({
    ...parent,
    phases: ((parent.phases as AnyNode[]) ?? []).map((p) => ({
      ...p,
      status: 'done',
      acceptance_criteria: ((p.acceptance_criteria as AnyNode[]) ?? []).map((ac) => ({
        ...ac,
        status: 'done',
        evidence: [`${p.slug}.ts:1 — implemented`],
      })),
    })),
  })
}

// workflow-smoke-e2e a1 + a3 — a ≥2-phase task with executor=workflow runs green
// end-to-end via the fan-out path; executor set through the set-executor OP
test('a1/a3: a 2-phase executor=workflow task runs green end-to-end; build→wrap', async () => {
  const ops = memOps()
  // persist + set executor via the OP (not raw) on both phases
  await ops.create(freshTask())
  await ops.setExecutor(await ops.read('wf-smoke'), 'p1', 'workflow')
  const node = await ops.setExecutor(await ops.read('wf-smoke'), 'p2', 'workflow')
  expect((node.phases as { executor?: string }[]).every((p) => p.executor === 'workflow')).toBe(
    true,
  )

  const dispatched: string[] = []
  const engine = createEngine({
    config: taskConfig,
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    spawn: { run: async () => ({ ok: true, kind: 'impl', evidence: ['ev'] }) },
    ops: engineOps(),
    descriptorFor: (t) => ({ childTier: t === 'task' ? 'phase' : undefined }),
    workflow: {
      dispatch: async (units) => {
        for (const u of units) dispatched.push(`${u.worker}:${u.child.slug}`) // WORKFLOW path taken
      },
      collect: selfWriteCollect(),
    },
  })

  const r = await engine.run('task', node)
  expect(r.status).toBe('ok')
  // a3 — the WORKFLOW dispatch branch ran with the workflow worker per phase
  expect(dispatched.sort()).toEqual(['workflow:p1', 'workflow:p2'])

  // a1 — every phase AC is done WITH evidence
  const phases = r.node.phases as {
    acceptance_criteria: { status: string; evidence?: string[] }[]
  }[]
  for (const p of phases) {
    for (const ac of p.acceptance_criteria) {
      expect(ac.status).toBe('done')
      expect(ac.evidence?.length).toBeGreaterThan(0)
    }
  }

  // a1 — the task is then legally transitioned build→wrap through the substrate
  const wrapped = await ops.setStatus({ ...(r.node as AnyNode), status: 'build' }, 'wrap')
  expect(wrapped.status).toBe('wrap')
})

// workflow-smoke-e2e a2 — equivalence: SEQUENTIAL vs WORKFLOW over the same
// definition → same done-phase set + same end status, different execution path
test('a2: sequential and workflow paths yield the same done set + end status', async () => {
  const doneSet = (n: AnyNode): string[] =>
    ((n.phases as { slug: string; status: string }[]) ?? [])
      .filter((p) => p.status === 'done')
      .map((p) => p.slug)
      .sort()

  // SEQUENTIAL: runChildTier marks each phase, loop advances child status to done
  const seqEngine = createEngine({
    config: { task: { build: { each: 'phase' } }, phase: { build: {} } },
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    spawn: { run: async () => ({ ok: true, kind: 'impl', evidence: ['ev'] }) },
    ops: engineOps(),
    descriptorFor: (t) => ({ childTier: t === 'task' ? 'phase' : undefined }),
  })
  const seq = await seqEngine.run('task', freshTask())

  // WORKFLOW: same definition, fan-out path, collect self-writes done
  const wfEngine = createEngine({
    config: taskConfig,
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    spawn: { run: async () => ({ ok: true, kind: 'impl', evidence: ['ev'] }) },
    ops: engineOps(),
    descriptorFor: (t) => ({ childTier: t === 'task' ? 'phase' : undefined }),
    workflow: { dispatch: async () => {}, collect: selfWriteCollect() },
  })
  const wf = await wfEngine.run('task', freshTask())

  expect(seq.status).toBe('ok')
  expect(wf.status).toBe('ok')
  expect(doneSet(seq.node)).toEqual(['p1', 'p2'])
  expect(doneSet(wf.node)).toEqual(doneSet(seq.node))
})

// workflow-smoke-e2e a4 — the Bash(anchored *) allowlist precondition is documented
// in the build skill (else the background workflow hangs on a permission prompt)
test('a4: build skill documents the Bash(anchored *) allowlist precondition', () => {
  const skill = readFileSync(
    new URL('../../../plugin/skills/build/SKILL.md', import.meta.url),
    'utf8',
  )
  expect(skill).toContain('Bash(anchored *)')
  expect(skill.toLowerCase()).toContain('allowlist')
})

// G14 — every user-question carries a recommendation + implications: the
// question-style reference exists and the question-authors + walks point at it.
test('G14: question-style reference exists; agents + walks follow it', () => {
  const ref = readFileSync(
    new URL('../../../plugin/references/question-style.md', import.meta.url),
    'utf8',
  )
  expect(ref.toLowerCase()).toContain('recommendation')
  expect(ref.toLowerCase()).toContain('implications')
  // question-authoring agents reference the convention
  for (const a of ['plan-decompose', 'refine-rules-check', 'epic-plan-check', 'epic-roll-up']) {
    expect(
      readFileSync(new URL(`../../../plugin/agents/${a}.md`, import.meta.url), 'utf8'),
    ).toContain('question-style.md')
  }
  // the walks reference it too (refine walk + build pre-build walk + plan)
  for (const s of ['plan', 'refine', 'build']) {
    expect(
      readFileSync(new URL(`../../../plugin/skills/${s}/SKILL.md`, import.meta.url), 'utf8'),
    ).toContain('question-style.md')
  }
})

// H1 — pipeline-narration is forbidden: communication-style names the rule, and the
// stage skills carry a partner-voice replacement for the step-by-step play-by-play.
test('H1: no pipeline narration — rule in communication-style + skill replacements', () => {
  const ref = readFileSync(
    new URL('../../../plugin/references/communication-style.md', import.meta.url),
    'utf8',
  )
  expect(ref).toMatch(/play-by-play/i)
  expect(ref.toLowerCase()).toContain('pair-programmer')
  const skill = (n: string) =>
    readFileSync(new URL(`../../../plugin/skills/${n}/SKILL.md`, import.meta.url), 'utf8')
  expect(skill('plan')).toContain('skizzier die zwei Tasks')
  expect(skill('refine')).toContain('arbeite ihre Akzeptanz-Kriterien aus')
  expect(skill('build')).toContain('von der Planung bis fertig')
})

// G13 — the setup skill exists (config-editor-that-consults, no funnel) and the
// plan skill offers onboarding when there is no anchored.yml yet.
test('G13: setup skill + onboarding offer on missing anchored.yml', () => {
  const setup = readFileSync(
    new URL('../../../plugin/skills/setup/SKILL.md', import.meta.url),
    'utf8',
  )
  expect(setup).toMatch(/name:\s*setup/)
  expect(setup.toLowerCase()).toContain('config editor that consults')
  expect(setup.toLowerCase()).toContain('never sell a setup')
  expect(setup).toMatch(/## Onboarding/i)
  // the plan skill routes onboarding to setup without blocking planning
  const plan = readFileSync(
    new URL('../../../plugin/skills/plan/SKILL.md', import.meta.url),
    'utf8',
  )
  expect(plan.toLowerCase()).toContain('onboarding')
  expect(plan).toContain('setup')
})

// q8 — the build SKILL documents the epic task-level fan-out (ready-children batch
// → parallel child-task lifecycles, lock-safe, buffered walk-questions).
test('q8: build SKILL documents epic task-level fan-out via ready-children', () => {
  const build = readFileSync(
    new URL('../../../plugin/skills/build/SKILL.md', import.meta.url),
    'utf8',
  )
  expect(build).toContain('ready-children')
  expect(build.toLowerCase()).toContain('fan-out')
  expect(build.toLowerCase()).toMatch(/buffer/i) // walk-questions buffered at the join
  expect(build.toLowerCase()).toMatch(/lock-safety|cross-process lock/i)
})

// G12 — refine decides the per-phase executor (the missing decision on top of the
// existing fan-out mechanism); the build SKILL still runs executor:workflow phases.
test('G12: refine SKILL decides the per-phase executor via set-executor', () => {
  const skill = (n: string) =>
    readFileSync(new URL(`../../../plugin/skills/${n}/SKILL.md`, import.meta.url), 'utf8')
  const refine = skill('refine')
  expect(refine).toContain('set-executor')
  expect(refine).toMatch(/fan-out/i)
  expect(refine).toMatch(/independent/i) // the suitability heuristic
  // the build side already consumes executor: workflow
  expect(skill('build')).toMatch(/executor: workflow/)
})

// G3/G5 — the build SKILL spells out the explicit epic each:task loop (JIT child
// lifecycle seeded from the stub-ACs), and no SKILL carries the stale pre-D1
// epic `building → done` transition (the lifecycle is now tier-uniform).
test('G3/G5: explicit epic each:task loop + no stale epic transition words', () => {
  const skill = (n: string) =>
    readFileSync(new URL(`../../../plugin/skills/${n}/SKILL.md`, import.meta.url), 'utf8')
  const build = skill('build')
  expect(build).toContain('JIT plan')
  expect(build).toMatch(/Seed its decomposition from the stub/i)
  expect(build).toMatch(/Build the child.*recurse/is) // child runs its own lifecycle
  // the pre-D1 tier-special epic transitions are gone everywhere
  for (const n of ['plan', 'refine', 'build', 'wrap']) {
    expect(skill(n)).not.toMatch(/building\s*→\s*done/)
    expect(skill(n)).not.toMatch(/planning\s*→\s*building/)
  }
})

// D2 — the epic-refine pipeline's new agents exist as plugin files and document
// their contract (epic-plan-check grounds vs code; epic-decompose authors per-stub
// outcome-ACs; epic-roll-up validates them hard-with-reconcile).
test('D2: epic-refine + roll-up agents exist and document their contract', () => {
  const read = (n: string) =>
    readFileSync(new URL(`../../../plugin/agents/${n}.md`, import.meta.url), 'utf8')
  expect(read('epic-decompose')).toContain('add-ac <epic-slug> <task-stub-slug>')
  expect(read('epic-decompose').toLowerCase()).toContain('outcome')
  expect(read('epic-plan-check').toLowerCase()).toContain('ground')
  expect(read('epic-roll-up').toLowerCase()).toContain('reconcile')
})

// G10 — partner-voice: the communication-style reference exists and every stage
// SKILL links it (so machinery vocabulary stops leaking into the user's chat).
test('G10: every stage SKILL references the communication-style guide', () => {
  const ref = readFileSync(
    new URL('../../../plugin/references/communication-style.md', import.meta.url),
    'utf8',
  )
  expect(ref.toLowerCase()).toContain('pair-programmer partner')
  for (const skill of ['plan', 'refine', 'build', 'wrap']) {
    const md = readFileSync(
      new URL(`../../../plugin/skills/${skill}/SKILL.md`, import.meta.url),
      'utf8',
    )
    expect(md).toContain('communication-style.md')
    expect(md).toContain('Avoid (machinery)')
  }
})

// G4 — the build-implement agent is evidence-only: its contract must NOT instruct
// it to flip the phase status (that bypassed the gate-before-done guarantee).
test('G4: build-implement agent is evidence-only — never flips the phase status', () => {
  const agent = readFileSync(
    new URL('../../../plugin/agents/build-implement.md', import.meta.url),
    'utf8',
  )
  // it documents evidence-only + the no-flip rule
  expect(agent.toLowerCase()).toContain('evidence-only')
  expect(agent).toMatch(/not\s+yours\s+to\s+flip/i)
  // it does NOT tell the agent to advance the phase to done via set-child-status
  expect(agent).not.toMatch(/set-child-status\s+<task-slug>\s+<phase-slug>\s+done/)
})
