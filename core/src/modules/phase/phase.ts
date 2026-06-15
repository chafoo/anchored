// _v3/modules/phase/phase.ts — createPhase({store, taskSchema}) → Tier. A phase has no own
// file: it lives in its task file (task.phases[]). So the phase factory owns the phase
// CONTENT verbs and operates on the TASK file — slug `<…>/<task>/<phase>` splits into the task
// slug (all but the last segment) + the phase slug (last). `taskSchema` is INJECTED (the
// orchestrator passes the task module's schema) so phase needs no task-module runtime dep.
// Every mutation: read task → transform the matching phase → store.write (the schema enforces
// the evidence invariant on every done-AC).
//
// Grammar (api.md two-token collections): node verbs (`get`/`set`/`status`) dispatch directly;
// collection verbs go `phase <collection> <op>` — `phase ac add …`, `phase ac set <id> text …`,
// `phase rule add …`. The reused vocabulary (add/list/get/set/remove + the AC domain ops
// done/evidence/fail/defer) replaces the old hyphenated one-offs. There is NO `execute` field
// and NO `phase build` verb — a phase is a sequential leaf advanced by `phase status <slug> done`.
import type { StorePort, Node, Schema } from '../../lib/contracts/store.js'
import type { Tier } from '../../lib/contracts/tier.js'
import { anchoredError } from '../../lib/utils/error.js'
import { dispatch, type Collections, type NodeVerbs } from '../shared/dispatch.js'
import { assertTransition, phaseTransitions } from '../shared/transitions.js'
import {
  addAc,
  evidenceAc,
  failAc,
  doneAc,
  deferAc,
  setAcText,
  type AcLike,
} from '../shared/acceptance.js'

interface PhaseLike {
  slug: string
  status: string
  name?: string
  acceptance_criteria?: AcLike[]
  rules?: { path: string; why: string }[]
  depends_on?: string[]
  [k: string]: unknown
}
interface TaskFile extends Node {
  phases?: PhaseLike[]
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

  // shape the phase's acceptance_criteria via a shared transform.
  const onAcs = (slug: string, fn: (acs: AcLike[]) => AcLike[]) =>
    mutate(slug, (phase) => ({
      ...phase,
      acceptance_criteria: fn(phase.acceptance_criteria ?? []),
    }))

  const nodeVerbs: NodeVerbs = {
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
              ['evidence each AC (ac evidence flips it done) or defer it with a reason (ac defer)'],
            )
          }
        }
        return { ...phase, status: to }
      }),

    // depends_on is set via the generic `set` verb (a comma list → string array). status,
    // managed collections + slug are reserved (their own verbs guard transitions/invariants).
    set: (slug, field, value) =>
      mutate(slug, (phase) => {
        if (['status', 'acceptance_criteria', 'rules', 'slug'].includes(field)) {
          throw anchoredError('ReservedField', `phase field '${field}' is reserved`, [
            'use the dedicated verb (status, ac add, rule add)',
          ])
        }
        if (field === 'depends_on') {
          return {
            ...phase,
            depends_on: value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        }
        return { ...phase, [field]: value }
      }),
  }

  const collections: Collections = {
    ac: {
      add: (slug, text, id) => onAcs(slug, (acs) => addAc(acs, text, id)),
      // evidence makes the AC pass: add the proof + flip done + retire any prior failures.
      evidence: (slug, acId, text) => onAcs(slug, (acs) => evidenceAc(acs, acId, text)),
      // a gate rejecting the AC: record why + flip back to pending (prior evidence stays history).
      fail: (slug, acId, text) => onAcs(slug, (acs) => failAc(acs, acId, text)),
      // defer the AC: record a reason + flip to deferred (terminal; the schema enforces a reason).
      defer: (slug, acId, reason) => onAcs(slug, (acs) => deferAc(acs, acId, reason)),
      // explicit done (only succeeds if evidence is already present — the store enforces it).
      done: (slug, acId) => onAcs(slug, (acs) => doneAc(acs, acId)),
      // edit an AC's TEXT (only the `text` field is settable; status/evidence have their own ops).
      set: (slug, acId, field, value) => {
        if (field !== 'text') {
          throw anchoredError(
            'AcFieldReserved',
            `only an AC's 'text' is settable (got '${field}')`,
            ["edit wording with: phase ac set <slug> <id> text '<new text>'"],
          )
        }
        return onAcs(slug, (acs) => setAcText(acs, acId, value))
      },
    },
    rule: {
      add: (slug, path, why) =>
        mutate(slug, (phase) => {
          const rules = phase.rules ?? []
          const next = rules.some((r) => r.path === path)
            ? rules.map((r) => (r.path === path ? { path, why } : r))
            : [...rules, { path, why }]
          return { ...phase, rules: next }
        }),
    },
  }

  return dispatch('phase', nodeVerbs, collections, (slug) => nodeVerbs.get!(slug))
}
