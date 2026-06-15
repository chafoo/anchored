// _v3/modules/phase/phase.ts — createPhase({store, taskSchema}) → Tier. A phase has no own
// file: it lives in its task file (task.phases[]). So the phase factory owns the phase
// CONTENT verbs (child owns its content: status · ac add/done/evidence/fail · rule-add ·
// set-execute · set-depends) and operates on the TASK file — slug `<…>/<task>/<phase>` splits into the
// task slug (all but the last segment) + the phase slug (last). `taskSchema` is INJECTED (the
// orchestrator passes the task module's schema) so phase needs no task-module runtime dep.
// Every mutation: read task → transform the matching phase → store.write (the schema enforces
// the evidence invariant on every done-AC).
import type { StorePort, Node, Schema } from '../../lib/contracts/store.js'
import type { Tier } from '../../lib/contracts/tier.js'
import { anchoredError } from '../../lib/utils/error.js'
import { assertTransition, phaseTransitions } from '../shared/transitions.js'
import { addAc, evidenceAc, failAc, doneAc, deferAc, type AcLike } from '../shared/acceptance.js'

interface PhaseLike {
  slug: string
  status: string
  name?: string
  acceptance_criteria?: AcLike[]
  rules?: { path: string; why: string }[]
  execute?: string
  depends_on?: string[]
  [k: string]: unknown
}
interface TaskFile extends Node {
  phases?: PhaseLike[]
}

const EXECUTE_MODES = ['sequential', 'workflow']

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

  // shape the phase's acceptance_criteria via a shared transform.
  const onAcs = (slug: string, fn: (acs: AcLike[]) => AcLike[]) =>
    mutate(slug, (phase) => ({
      ...phase,
      acceptance_criteria: fn(phase.acceptance_criteria ?? []),
    }))

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
          // an AC is terminal-OK when done OR deferred (a documented deferral does not block).
          const open = (phase.acceptance_criteria ?? []).filter(
            (a) => !['done', 'deferred'].includes(a.status),
          )
          if (open.length > 0) {
            throw anchoredError(
              'PhaseIncomplete',
              `cannot mark '${phase.slug}' done: acceptance criteria not terminal — ${open.map((a) => a.id).join(', ')}`,
              ['evidence each AC (ac-evidence flips it done) or defer it with a reason (ac-defer)'],
            )
          }
        }
        return { ...phase, status: to }
      }),

    'ac-add': (slug, text, id) => onAcs(slug, (acs) => addAc(acs, text, id)),

    // evidence makes the AC pass: add the proof + flip done (the schema then validates
    // evidence-present) + retire any prior failures (it re-passed).
    'ac-evidence': (slug, acId, text) => onAcs(slug, (acs) => evidenceAc(acs, acId, text)),

    // a gate rejecting the AC: record why + flip back to pending (prior evidence stays history).
    'ac-fail': (slug, acId, text) => onAcs(slug, (acs) => failAc(acs, acId, text)),

    // defer the AC: record a reason + flip to deferred (terminal; the schema enforces a reason).
    'ac-defer': (slug, acId, reason) => onAcs(slug, (acs) => deferAc(acs, acId, reason)),

    // explicit done (only succeeds if evidence is already present — the store's write enforces it).
    'ac-done': (slug, acId) => onAcs(slug, (acs) => doneAc(acs, acId)),

    'rule-add': (slug, path, why) =>
      mutate(slug, (phase) => {
        const rules = phase.rules ?? []
        const next = rules.some((r) => r.path === path)
          ? rules.map((r) => (r.path === path ? { path, why } : r))
          : [...rules, { path, why }]
        return { ...phase, rules: next }
      }),

    // execute: how this phase builds — sequential (the implement path) or workflow (fan its
    // acceptance criteria out). plan/refine sets it; the build skill reads it.
    'set-execute': (slug, value) =>
      mutate(slug, (phase) => {
        if (!EXECUTE_MODES.includes(value)) {
          throw anchoredError(
            'InvalidExecute',
            `execute must be one of ${EXECUTE_MODES.join(' | ')} (got '${value}')`,
          )
        }
        return { ...phase, execute: value }
      }),

    // depends_on: comma-separated phase slugs that must finish before this phase — plan/refine
    // sets it so ready-phases can run independent phases in parallel (multi-phase fan-out).
    'set-depends': (slug, value) =>
      mutate(slug, (phase) => ({
        ...phase,
        depends_on: value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      })),

    set: (slug, field, value) =>
      mutate(slug, (phase) => {
        if (
          ['status', 'acceptance_criteria', 'rules', 'slug', 'execute', 'depends_on'].includes(
            field,
          )
        ) {
          throw anchoredError('ReservedField', `phase field '${field}' is reserved`, [
            'use the dedicated verb (status, ac-add, rule-add, set-execute, set-depends)',
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
