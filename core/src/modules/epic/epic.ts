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
import { dispatch, type Collections, type NodeVerbs, type Verb } from '../shared/dispatch.js'
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

// set a (possibly dotted) path immutably — lets `epic set <slug> context.refine "…"` write into
// the nested context trail correctly (C5 parity with task/phase), instead of a literal flat key.
function setNested(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path as [string, ...string[]]
  if (rest.length === 0) return { ...obj, [head]: value }
  const cur = obj[head]
  const child = cur && typeof cur === 'object' ? (cur as Record<string, unknown>) : {}
  return { ...obj, [head]: setNested(child, rest, value) }
}

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

  // outcome-level ACs PER task-stub (epic-refine works these out) — same shape + evidence
  // invariant as a phase AC. They DOCUMENT the outcomes; per B1 they no longer gate the stub's
  // `child status done` (the child task's own phase-completion floor delivers the child, the
  // roll-up/wrap verifies the outcomes). The nested `child ac <op>` collection routes here.
  const childAc: Record<string, Verb> = {
    add: (slug, childSlug, text) =>
      mutateStub(slug, childSlug, (s) => ({
        ...s,
        acceptance_criteria: addAc(s.acceptance_criteria ?? [], text),
      })),
    evidence: (slug, childSlug, acId, proof) =>
      mutateStub(slug, childSlug, (s) => ({
        ...s,
        acceptance_criteria: evidenceAc(s.acceptance_criteria ?? [], acId, proof),
      })),
    fail: (slug, childSlug, acId, why) =>
      mutateStub(slug, childSlug, (s) => ({
        ...s,
        acceptance_criteria: failAc(s.acceptance_criteria ?? [], acId, why),
      })),
    defer: (slug, childSlug, acId, reason) =>
      mutateStub(slug, childSlug, (s) => ({
        ...s,
        acceptance_criteria: deferAc(s.acceptance_criteria ?? [], acId, reason),
      })),
  }

  const nodeVerbs: NodeVerbs = {
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
      const path = field.split('.')
      if (RESERVED.has(path[0]!))
        throw anchoredError('ReservedField', `field '${field}' is reserved`)
      const node = await read(slug)
      const next = path.length > 1 ? setNested(node, path, value) : { ...node, [field]: value }
      return write(slug, next as EpicNodeLike)
    },

    // archive cascades: an epic moves its whole folder (child task files included), and we mark
    // every delivered (status 'done') child stub as archived in the returned summary (C2).
    async archive(slug) {
      const node = await read(slug).catch(() => undefined)
      const delivered = (node?.tasks ?? [])
        .filter((t) => t.status === 'done')
        .map((t) => `${slug}/${t.slug}`)
      await store.archive(slug)
      return { slug, archived: true, children: delivered }
    },
    async reset(slug) {
      await store.remove(slug)
      return { slug, reset: true }
    },
  }

  const collections: Collections = {
    // task-stub existence + the per-stub outcome-AC sub-collection (`child ac <op>`).
    child: {
      async add(slug, childSlug, goal) {
        const node = await read(slug)
        const stub: Stub = {
          slug: childSlug,
          status: 'pending',
          ...(goal !== undefined ? { goal } : {}),
        }
        return write(slug, { ...node, tasks: addChild(stubsOf(node), stub) })
      },
      async next(slug) {
        return nextChild(stubsOf(await read(slug)))
      },
      async ready(slug) {
        return readyChildren(stubsOf(await read(slug)))
      },
      // B1: flipping a stub to `done` no longer requires its outcome ACs to be terminal — the
      // child task's own phase-completion floor delivers it; outcomes are verified at roll-up/wrap.
      status: (slug, childSlug, status) =>
        mutateStub(slug, childSlug, (s) => {
          if (!stubStatusValues.includes(status as (typeof stubStatusValues)[number])) {
            throw anchoredError(
              'InvalidChildStatus',
              `'${status}' is not a valid task-stub status`,
              [...stubStatusValues],
            )
          }
          return { ...s, status }
        }),
      set: (slug, childSlug, field, value) =>
        mutateStub(slug, childSlug, (s) => {
          if (['slug', 'status', 'acceptance_criteria'].includes(field)) {
            throw anchoredError('ReservedField', `stub field '${field}' is reserved`)
          }
          return {
            ...s,
            [field]: field === 'depends_on' ? value.split(',').map((x) => x.trim()) : value,
          }
        }),
      // the per-stub outcome-AC sub-collection: `epic child ac <op> <slug> <childSlug> …`.
      ac: (subOp, ...rest) => {
        const fn = childAc[subOp]
        if (!fn) {
          throw anchoredError('UnknownOp', `'epic child ac' has no op '${subOp}'`, [
            `ops: ${Object.keys(childAc).join(', ')}`,
          ])
        }
        return fn(...rest)
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
    },

    // epic DoD acceptance items
    acceptance: {
      async add(slug, text) {
        const node = await read(slug)
        const items = node.acceptance ?? []
        return write(slug, {
          ...node,
          acceptance: [...items, { id: nextEid(items), text, status: 'pending' }],
        })
      },
      // detail = delivery evidence for `done`, the deferral reason for `deferred`. The schema
      // backstops both; these explicit checks give the better message.
      async status(slug, id, status, detail) {
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
              ['pass provenance: acceptance status <slug> <id> done "<task>/<phase> — delivered"'],
            )
          }
          next = { ...item, status, evidence: merged }
        } else if (status === 'deferred') {
          if (!(detail && detail.trim())) {
            throw anchoredError(
              'AcceptanceNoReason',
              `acceptance item '${id}' cannot be deferred without a reason`,
              ['pass the reason: acceptance status <slug> <id> deferred "<why postponed>"'],
            )
          }
          next = { ...item, status, reason: detail }
        } else {
          next = { ...item, status }
        }
        return write(slug, { ...node, acceptance: items.map((a) => (a.id === id ? next : a)) })
      },
    },

    question: {
      async add(slug, text, priority) {
        const node = await read(slug)
        return write(slug, {
          ...node,
          questions: addQuestion(node.questions ?? [], {
            text,
            priority: (priority ?? 'medium') as 'low' | 'medium' | 'high',
          }),
        })
      },
      async resolve(slug, id, answer, source, reasoning) {
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
    },
    concern: {
      async add(slug, text, priority) {
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
      async resolve(slug, id, answer, source, reasoning) {
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
    },
    log: {
      async add(slug, at, kind, note) {
        const node = await read(slug)
        return write(slug, { ...node, log: appendLog(node.log ?? [], { at, kind, note }) })
      },
    },
  }

  return dispatch('epic', nodeVerbs, collections, (slug) => read(slug))
}
