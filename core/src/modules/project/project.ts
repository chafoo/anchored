// _v3/modules/project/project.ts — createProject({store,template,epic}) → Tier. The project
// factory: the same shape as epic one tier up. Owns the project lifecycle + node verbs, the
// epic-STUB verbs (the loop queue in the project file: .epics[]), the project DoD acceptance
// items, and the roll-up (reads the child EPIC files via the injected `epic` module — by
// contract). Every verb = read project → pure transform → store.write(slug, …, ProjectNodeSchema).
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
import { ProjectNodeSchema } from './project.schemas.js'

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
interface ProjectNodeLike extends Node {
  slug: string
  status: string
  epics?: Stub[]
  acceptance?: AcceptanceItem[]
  questions?: Question[]
  concerns?: Question[]
  log?: LogEntry[]
}

function assertProjectCompletable(node: ProjectNodeLike): void {
  const open = (node.concerns ?? []).filter((c) => c.status !== 'resolved')
  if (open.length > 0) {
    throw anchoredError('ConcernsOpen', `cannot complete: ${open.length} open concern(s)`, [
      'resolve them at wrap',
    ])
  }
  const stubs = (node.epics ?? []).filter((e) => e.status !== 'done')
  if (stubs.length > 0) {
    throw anchoredError(
      'ChildrenIncomplete',
      `cannot complete: epic-stubs not done — ${stubs.map((s) => s.slug).join(', ')}`,
      ['finish every epic-stub first'],
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
  'epics',
  'acceptance',
  'questions',
  'concerns',
  'log',
  'schema_version',
  'slug',
])
const nextEid = (items: { id: string }[]) =>
  `e${items.reduce((m, a) => Math.max(m, Number(/^e(\d+)$/.exec(a.id)?.[1] ?? 0)), 0) + 1}`

export function createProject(deps: {
  store: StorePort
  template: TemplatePort
  epic: Tier
}): Tier {
  const { store, template, epic } = deps
  const read = (slug: string) => store.read(slug, ProjectNodeSchema) as Promise<ProjectNodeLike>
  const write = (slug: string, node: ProjectNodeLike) => store.write(slug, node, ProjectNodeSchema)
  const stubsOf = (n: ProjectNodeLike) => n.epics ?? []
  const stagePlan = async (stage: string, slug: string) => ({
    ...template.steps('project', stage),
    node: await read(slug),
  })

  const mutateStub = (slug: string, childSlug: string, fn: (s: Stub) => Stub) =>
    read(slug).then((node) => {
      const stubs = stubsOf(node)
      const idx = stubs.findIndex((s) => s.slug === childSlug)
      if (idx < 0) throw anchoredError('UnknownChild', `no epic-stub '${childSlug}'`)
      return write(slug, { ...node, epics: stubs.map((s, i) => (i === idx ? fn(s) : s)) })
    })

  const verbs: Record<string, (...args: string[]) => Promise<unknown>> = {
    get: (slug) => read(slug),
    create: (slug, title) =>
      write(slug, {
        schema_version: 2,
        slug,
        title: title ?? slug,
        status: 'plan',
        epics: [],
      } as ProjectNodeLike),
    plan: (slug) => stagePlan('plan', slug),
    refine: (slug) => stagePlan('refine', slug),
    build: (slug) => stagePlan('build', slug),
    wrap: (slug) => stagePlan('wrap', slug),

    async status(slug, to) {
      const node = await read(slug)
      assertTransition(lifecycleTransitions, node.status, to, 'project')
      if (to === 'build') assertNoOpenQuestions(node.questions ?? [], 'project')
      if (to === 'done') assertProjectCompletable(node)
      return write(slug, { ...node, status: to })
    },
    async set(slug, field, value) {
      if (RESERVED.has(field.split('.')[0]!))
        throw anchoredError('ReservedField', `field '${field}' is reserved`)
      const node = await read(slug)
      return write(slug, { ...node, [field]: value })
    },

    async 'child-add'(slug, childSlug, goal) {
      const node = await read(slug)
      const stub: Stub = {
        slug: childSlug,
        status: 'pending',
        ...(goal !== undefined ? { goal } : {}),
      }
      return write(slug, { ...node, epics: addChild(stubsOf(node), stub) })
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
          throw anchoredError('InvalidChildStatus', `'${status}' is not a valid epic-stub status`, [
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

    // outcome-level ACs PER epic-stub (project-refine works these out) — same shape + evidence
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
            ['pass the provenance: set-acceptance-status <slug> <id> done "<epic> — delivered"'],
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

    async 'roll-up'(slug) {
      const node = await read(slug)
      const children = await Promise.all(
        stubsOf(node).map(async (s) => {
          const childSlug = s.slug
          let childStatus: string
          try {
            childStatus = ((await epic.get(childSlug)) as { status?: string }).status ?? 'unknown'
          } catch {
            childStatus = 'missing'
          }
          return { slug: s.slug, stubStatus: s.status, childStatus }
        }),
      )
      return { project: node.slug, children, acceptance: node.acceptance ?? [] }
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
    tier: 'project',
    verbs: () => Object.keys(verbs),
    get: (slug) => read(slug),
    run: async (verb, args) => {
      const fn = verbs[verb]
      if (!fn)
        throw anchoredError('UnknownVerb', `project has no verb '${verb}'`, [
          `known: ${Object.keys(verbs).join(', ')}`,
        ])
      return fn(...args)
    },
  }
}
