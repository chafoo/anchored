// _v3/modules/epic/epic.ts — createEpic({store,template,task}) → Tier. The epic factory: owns
// the epic lifecycle, the node verbs, the task-STUB verbs (parent owns child existence — the
// stubs are the loop queue in the epic file), the epic DoD `acceptance` items, and the roll-up
// (which reads the child TASK files via the injected `task` module — the one module→module
// dependency, by contract). Every verb = read epic → pure transform → store.write(slug, …,
// EpicNodeSchema).
import type { StorePort, Node } from '../../lib/contracts/store.js'
import type { TemplatePort } from '../../lib/contracts/template.js'
import type { Tier } from '../../lib/contracts/tier.js'
import { anchoredError } from '../../lib/utils/error.js'
import { assertTransition, lifecycleTransitions } from '../shared/transitions.js'
import { stubStatusValues } from '../shared/statuses.js'
import { nextChild, readyChildren, addChild, type ChildLike } from '../shared/children.js'
import {
  addQuestion,
  resolveQuestion,
  assertNoOpenQuestions,
  type Question,
} from '../shared/questions.js'
import { appendLog, type LogEntry } from '../shared/log.js'
import { addAc, evidenceAc, failAc, deferAc, type AcLike } from '../shared/acceptance.js'
import { EpicNodeSchema } from './epic.schemas.js'

interface Stub extends ChildLike {
  goal?: string
  acceptance_criteria?: AcLike[]
}
interface AcceptanceItem {
  id: string
  text: string
  status: string
  evidence?: string[]
  reason?: string
}
interface EpicNodeLike extends Node {
  slug: string
  status: string
  tasks?: Stub[]
  acceptance?: AcceptanceItem[]
  questions?: Question[]
  concerns?: Question[]
  log?: LogEntry[]
}

function assertEpicCompletable(node: EpicNodeLike): void {
  const open = (node.concerns ?? []).filter((c) => c.status !== 'resolved')
  if (open.length > 0) {
    throw anchoredError('ConcernsOpen', `cannot complete: ${open.length} open concern(s)`, [
      'resolve them at wrap',
    ])
  }
  const stubs = (node.tasks ?? []).filter((t) => t.status !== 'done')
  if (stubs.length > 0) {
    throw anchoredError(
      'ChildrenIncomplete',
      `cannot complete: task-stubs not done — ${stubs.map((s) => s.slug).join(', ')}`,
      ['finish every task-stub first'],
    )
  }
  const acc = (node.acceptance ?? []).filter((a) => !['done', 'deferred'].includes(a.status))
  if (acc.length > 0) {
    throw anchoredError(
      'AcceptanceIncomplete',
      `cannot complete: DoD items not terminal — ${acc.map((a) => a.id).join(', ')}`,
      ['roll up + flip each acceptance item with delivery evidence (or defer it with a reason)'],
    )
  }
}

const RESERVED = new Set([
  'status',
  'tasks',
  'acceptance',
  'questions',
  'concerns',
  'log',
  'schema_version',
  'slug',
])
const nextEid = (items: { id: string }[]) =>
  `e${items.reduce((m, a) => Math.max(m, Number(/^e(\d+)$/.exec(a.id)?.[1] ?? 0)), 0) + 1}`

export function createEpic(deps: { store: StorePort; template: TemplatePort; task: Tier }): Tier {
  const { store, template, task } = deps
  const read = (slug: string) => store.read(slug, EpicNodeSchema) as Promise<EpicNodeLike>
  const write = (slug: string, node: EpicNodeLike) => store.write(slug, node, EpicNodeSchema)
  const stubsOf = (n: EpicNodeLike) => n.tasks ?? []
  const stagePlan = async (stage: string, slug: string) => ({
    ...template.steps('epic', stage),
    node: await read(slug),
  })

  const mutateStub = (slug: string, childSlug: string, fn: (s: Stub) => Stub) =>
    read(slug).then((node) => {
      const stubs = stubsOf(node)
      const idx = stubs.findIndex((s) => s.slug === childSlug)
      if (idx < 0) throw anchoredError('UnknownChild', `no task-stub '${childSlug}'`)
      return write(slug, { ...node, tasks: stubs.map((s, i) => (i === idx ? fn(s) : s)) })
    })

  const verbs: Record<string, (...args: string[]) => Promise<unknown>> = {
    get: (slug) => read(slug),
    create: (slug, title) =>
      write(slug, {
        schema_version: 2,
        slug,
        title: title ?? slug,
        status: 'plan',
        tasks: [],
      } as EpicNodeLike),
    plan: (slug) => stagePlan('plan', slug),
    refine: (slug) => stagePlan('refine', slug),
    build: (slug) => stagePlan('build', slug),
    wrap: (slug) => stagePlan('wrap', slug),

    async status(slug, to) {
      const node = await read(slug)
      assertTransition(lifecycleTransitions, node.status, to, 'epic')
      if (to === 'build') assertNoOpenQuestions(node.questions ?? [], 'epic')
      if (to === 'done') assertEpicCompletable(node)
      return write(slug, { ...node, status: to })
    },
    async set(slug, field, value) {
      if (RESERVED.has(field.split('.')[0]!))
        throw anchoredError('ReservedField', `field '${field}' is reserved`)
      const node = await read(slug)
      return write(slug, { ...node, [field]: value })
    },

    // task-stub existence (the loop queue)
    async 'child-add'(slug, childSlug, goal) {
      const node = await read(slug)
      const stub: Stub = {
        slug: childSlug,
        status: 'pending',
        ...(goal !== undefined ? { goal } : {}),
      }
      return write(slug, { ...node, tasks: addChild(stubsOf(node), stub) })
    },
    async 'child-next'(slug) {
      return nextChild(stubsOf(await read(slug)))
    },
    async 'child-ready'(slug) {
      return readyChildren(stubsOf(await read(slug)))
    },
    'child-status': (slug, childSlug, status) =>
      mutateStub(slug, childSlug, (s) => {
        if (!stubStatusValues.includes(status as (typeof stubStatusValues)[number])) {
          throw anchoredError('InvalidChildStatus', `'${status}' is not a valid task-stub status`, [
            ...stubStatusValues,
          ])
        }
        if (status === 'done') {
          const openAcs = (s.acceptance_criteria ?? []).filter(
            (a) => !['done', 'deferred'].includes(a.status),
          )
          if (openAcs.length > 0) {
            throw anchoredError(
              'ChildIncomplete',
              `cannot mark '${childSlug}' done: ACs not terminal — ${openAcs.map((a) => a.id).join(', ')}`,
            )
          }
        }
        return { ...s, status }
      }),
    'child-set-field': (slug, childSlug, field, value) =>
      mutateStub(slug, childSlug, (s) => {
        if (['slug', 'status', 'acceptance_criteria'].includes(field)) {
          throw anchoredError('ReservedField', `stub field '${field}' is reserved`)
        }
        return {
          ...s,
          [field]: field === 'depends_on' ? value.split(',').map((x) => x.trim()) : value,
        }
      }),

    // outcome-level ACs PER task-stub (epic-refine works these out) — same shape + evidence
    // invariant as a phase AC; gates the stub's child-status done (see child-status above).
    'child-ac-add': (slug, childSlug, text) =>
      mutateStub(slug, childSlug, (s) => ({
        ...s,
        acceptance_criteria: addAc(s.acceptance_criteria ?? [], text),
      })),
    'child-ac-evidence': (slug, childSlug, acId, proof) =>
      mutateStub(slug, childSlug, (s) => ({
        ...s,
        acceptance_criteria: evidenceAc(s.acceptance_criteria ?? [], acId, proof),
      })),
    'child-ac-fail': (slug, childSlug, acId, why) =>
      mutateStub(slug, childSlug, (s) => ({
        ...s,
        acceptance_criteria: failAc(s.acceptance_criteria ?? [], acId, why),
      })),
    'child-ac-defer': (slug, childSlug, acId, reason) =>
      mutateStub(slug, childSlug, (s) => ({
        ...s,
        acceptance_criteria: deferAc(s.acceptance_criteria ?? [], acId, reason),
      })),

    // epic DoD acceptance items
    async 'add-acceptance'(slug, text) {
      const node = await read(slug)
      const items = node.acceptance ?? []
      return write(slug, {
        ...node,
        acceptance: [...items, { id: nextEid(items), text, status: 'pending' }],
      })
    },
    // detail = delivery evidence for `done`, the deferral reason for `deferred`. The schema
    // backstops both; these explicit checks give the better message.
    async 'set-acceptance-status'(slug, id, status, detail) {
      const node = await read(slug)
      const items = node.acceptance ?? []
      const item = items.find((a) => a.id === id)
      if (!item) throw anchoredError('UnknownAcceptance', `no acceptance item '${id}'`)
      let next: AcceptanceItem
      if (status === 'done') {
        const merged = detail ? [...(item.evidence ?? []), detail] : item.evidence
        if (!(merged && merged.length > 0)) {
          throw anchoredError(
            'AcceptanceNoEvidence',
            `acceptance item '${id}' cannot be done without delivery evidence`,
            [
              'pass provenance: set-acceptance-status <slug> <id> done "<task>/<phase> — delivered"',
            ],
          )
        }
        next = { ...item, status, evidence: merged }
      } else if (status === 'deferred') {
        if (!(detail && detail.trim())) {
          throw anchoredError(
            'AcceptanceNoReason',
            `acceptance item '${id}' cannot be deferred without a reason`,
            ['pass the reason: set-acceptance-status <slug> <id> deferred "<why postponed>"'],
          )
        }
        next = { ...item, status, reason: detail }
      } else {
        next = { ...item, status }
      }
      return write(slug, { ...node, acceptance: items.map((a) => (a.id === id ? next : a)) })
    },

    // roll-up: read each stub's child TASK file (via the injected task module) → report status.
    async 'roll-up'(slug) {
      const node = await read(slug)
      const children = await Promise.all(
        stubsOf(node).map(async (s) => {
          const childSlug = `${node.slug}/${s.slug}`
          let childStatus: string
          try {
            childStatus = ((await task.get(childSlug)) as { status?: string }).status ?? 'unknown'
          } catch {
            childStatus = 'missing'
          }
          return { slug: s.slug, stubStatus: s.status, childStatus }
        }),
      )
      return { epic: node.slug, children, acceptance: node.acceptance ?? [] }
    },

    async 'question-add'(slug, text, priority) {
      const node = await read(slug)
      return write(slug, {
        ...node,
        questions: addQuestion(node.questions ?? [], {
          text,
          priority: (priority ?? 'medium') as 'low' | 'medium' | 'high',
        }),
      })
    },
    async 'question-resolve'(slug, id, answer, source, reasoning) {
      const node = await read(slug)
      return write(slug, {
        ...node,
        questions: resolveQuestion(node.questions ?? [], id, {
          answer,
          source: (source ?? 'user') as 'user' | 'ai',
          ...(reasoning !== undefined ? { reasoning } : {}),
        }),
      })
    },
    async 'concern-add'(slug, text, priority) {
      const node = await read(slug)
      return write(slug, {
        ...node,
        concerns: addQuestion(
          node.concerns ?? [],
          { text, priority: (priority ?? 'medium') as 'low' | 'medium' | 'high' },
          'c',
        ),
      })
    },
    async 'concern-resolve'(slug, id, answer, source, reasoning) {
      const node = await read(slug)
      return write(slug, {
        ...node,
        concerns: resolveQuestion(node.concerns ?? [], id, {
          answer,
          source: (source ?? 'user') as 'user' | 'ai',
          ...(reasoning !== undefined ? { reasoning } : {}),
        }),
      })
    },
    async 'append-log'(slug, at, kind, note) {
      const node = await read(slug)
      return write(slug, { ...node, log: appendLog(node.log ?? [], { at, kind, note }) })
    },

    async archive(slug) {
      await store.archive(slug)
      return { slug, archived: true }
    },
    async reset(slug) {
      await store.remove(slug)
      return { slug, reset: true }
    },
  }

  return {
    tier: 'epic',
    verbs: () => Object.keys(verbs),
    get: (slug) => read(slug),
    run: async (verb, args) => {
      const fn = verbs[verb]
      if (!fn)
        throw anchoredError('UnknownVerb', `epic has no verb '${verb}'`, [
          `known: ${Object.keys(verbs).join(', ')}`,
        ])
      return fn(...args)
    },
  }
}
