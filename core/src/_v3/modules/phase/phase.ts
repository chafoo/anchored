// _v3/modules/phase/phase.ts — createPhase({store, taskSchema}) → Tier. A phase has no own
// file: it lives in its task file (task.phases[]). So the phase factory owns the phase
// CONTENT verbs (child owns its content: status · ac add/done/evidence/fail · rule-add ·
// set-executor) and operates on the TASK file — slug `<…>/<task>/<phase>` splits into the
// task slug (all but the last segment) + the phase slug (last). `taskSchema` is INJECTED (the
// orchestrator passes the task module's schema) so phase needs no task-module runtime dep.
// Every mutation: read task → transform the matching phase → store.write (the schema enforces
// the evidence invariant on every done-AC).
import type { StorePort, Node, Schema } from '../../lib/contracts/store.js'
import type { Tier } from '../../lib/contracts/tier.js'
import { anchoredError } from '../../lib/utils/error.js'
import { assertTransition, phaseTransitions } from '../shared/transitions.js'

interface AcLike {
  id: string
  text?: string
  status: string
  evidence?: string[]
  failures?: string[]
}
interface PhaseLike {
  slug: string
  status: string
  name?: string
  acceptance_criteria?: AcLike[]
  rules?: { path: string; why: string }[]
  executor?: string
  [k: string]: unknown
}
interface TaskFile extends Node {
  phases?: PhaseLike[]
}

const EXECUTORS = ['implement', 'workflow']

function nextAcId(acs: AcLike[]): string {
  const max = acs.reduce((m, ac) => {
    const n = /^a(\d+)$/.exec(ac.id)
    return n ? Math.max(m, Number(n[1])) : m
  }, 0)
  return `a${max + 1}`
}

// when an AC flips done after a failures-driven redo, retire its transient failures.
function retireFailures(ac: AcLike): AcLike {
  if (!('failures' in ac)) return ac
  const { failures: _drop, ...rest } = ac
  void _drop
  return rest
}

export function createPhase(deps: { store: StorePort; taskSchema: Schema }): Tier {
  const { store, taskSchema } = deps

  const split = (slug: string): { taskSlug: string; phaseSlug: string } => {
    const i = slug.lastIndexOf('/')
    if (i < 0) {
      throw anchoredError('BadSlug', `a phase slug is '<task>/<phase>' (got '${slug}')`, [
        'address a phase under its task, e.g. my-epic/login/setup',
      ])
    }
    return { taskSlug: slug.slice(0, i), phaseSlug: slug.slice(i + 1) }
  }

  const findPhase = (
    task: TaskFile,
    phaseSlug: string,
    taskSlug: string,
  ): { phases: PhaseLike[]; idx: number } => {
    const phases = task.phases ?? []
    const idx = phases.findIndex((p) => p.slug === phaseSlug)
    if (idx < 0) throw anchoredError('UnknownPhase', `no phase '${phaseSlug}' in '${taskSlug}'`)
    return { phases, idx }
  }

  // read task → transform the addressed phase → write task.
  const mutate = async (slug: string, fn: (phase: PhaseLike) => PhaseLike): Promise<unknown> => {
    const { taskSlug, phaseSlug } = split(slug)
    const task = (await store.read(taskSlug, taskSchema)) as TaskFile
    const { phases, idx } = findPhase(task, phaseSlug, taskSlug)
    const next = fn(phases[idx]!)
    return store.write(
      taskSlug,
      { ...task, phases: phases.map((p, i) => (i === idx ? next : p)) },
      taskSchema,
    )
  }

  const mutateAc = (slug: string, acId: string, fn: (ac: AcLike) => AcLike) =>
    mutate(slug, (phase) => {
      const acs = phase.acceptance_criteria ?? []
      if (!acs.some((a) => a.id === acId)) {
        throw anchoredError('UnknownAc', `no acceptance criterion '${acId}'`)
      }
      return { ...phase, acceptance_criteria: acs.map((a) => (a.id === acId ? fn(a) : a)) }
    })

  const verbs: Record<string, (...args: string[]) => Promise<unknown>> = {
    async get(slug) {
      const { taskSlug, phaseSlug } = split(slug)
      const task = (await store.read(taskSlug, taskSchema)) as TaskFile
      return (task.phases ?? []).find((p) => p.slug === phaseSlug) ?? null
    },

    status: (slug, to) =>
      mutate(slug, (phase) => {
        assertTransition(phaseTransitions, phase.status, to, 'phase')
        if (to === 'done') {
          const open = (phase.acceptance_criteria ?? []).filter((a) => a.status !== 'done')
          if (open.length > 0) {
            throw anchoredError(
              'PhaseIncomplete',
              `cannot mark '${phase.slug}' done: acceptance criteria not done — ${open.map((a) => a.id).join(', ')}`,
              ['evidence each AC first (ac-evidence flips it done)'],
            )
          }
        }
        return { ...phase, status: to }
      }),

    'ac-add': (slug, text, id) =>
      mutate(slug, (phase) => {
        const acs = phase.acceptance_criteria ?? []
        const acId = id ?? nextAcId(acs)
        if (acs.some((a) => a.id === acId))
          throw anchoredError('DuplicateAc', `ac '${acId}' already exists`)
        return { ...phase, acceptance_criteria: [...acs, { id: acId, text, status: 'pending' }] }
      }),

    // evidence makes the AC pass: add the proof + flip done (the schema then validates
    // evidence-present) + retire any prior failures (it re-passed).
    'ac-evidence': (slug, acId, text) =>
      mutateAc(slug, acId, (ac) =>
        retireFailures({ ...ac, evidence: [...(ac.evidence ?? []), text], status: 'done' }),
      ),

    // a gate rejecting the AC: record why + flip back to pending (prior evidence stays history).
    'ac-fail': (slug, acId, text) =>
      mutateAc(slug, acId, (ac) => ({
        ...ac,
        failures: [...(ac.failures ?? []), text],
        status: 'pending',
      })),

    // explicit done (only succeeds if evidence is already present — the store's write enforces it).
    'ac-done': (slug, acId) =>
      mutateAc(slug, acId, (ac) => retireFailures({ ...ac, status: 'done' })),

    'rule-add': (slug, path, why) =>
      mutate(slug, (phase) => {
        const rules = phase.rules ?? []
        const next = rules.some((r) => r.path === path)
          ? rules.map((r) => (r.path === path ? { path, why } : r))
          : [...rules, { path, why }]
        return { ...phase, rules: next }
      }),

    'set-executor': (slug, value) =>
      mutate(slug, (phase) => {
        if (!EXECUTORS.includes(value)) {
          throw anchoredError(
            'InvalidExecutor',
            `executor must be one of ${EXECUTORS.join(' | ')} (got '${value}')`,
          )
        }
        return { ...phase, executor: value }
      }),

    set: (slug, field, value) =>
      mutate(slug, (phase) => {
        if (['status', 'acceptance_criteria', 'rules', 'slug', 'executor'].includes(field)) {
          throw anchoredError('ReservedField', `phase field '${field}' is reserved`, [
            'use the dedicated verb (status, ac-add, rule-add, set-executor)',
          ])
        }
        return { ...phase, [field]: value }
      }),
  }

  return {
    tier: 'phase',
    verbs: () => Object.keys(verbs),
    get: (slug) => verbs.get!(slug),
    run: async (verb, args) => {
      const fn = verbs[verb]
      if (!fn)
        throw anchoredError('UnknownVerb', `phase has no verb '${verb}'`, [
          `known: ${Object.keys(verbs).join(', ')}`,
        ])
      return fn(...args)
    },
  }
}
