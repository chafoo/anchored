// _v3/modules/task/task.ts — createTask({store,template}) → Tier. The task factory: owns the
// task lifecycle (plan/refine/build/wrap return the orchestration plan from template), the
// task node verbs (get/set/status), and the phase-EXISTENCE collection (parent owns child
// existence: `phase add` / `phase list` / `phase next` / `phase ready`). The phase CONTENT
// verbs (status/ac/rule) live in the phase module (it writes the same task file). Grammar is
// the api.md two-token form: collections (`phase` · `question` · `concern`) dispatch as
// `task <collection> <op>`. Every verb = read → pure transform → store.write(slug, …,
// TaskNodeSchema); the schema (with the evidence refine) is the store's only law.
import type { StorePort, Node } from '../../lib/contracts/store.js'
import type { TemplatePort } from '../../lib/contracts/template.js'
import type { Tier } from '../../lib/contracts/tier.js'
import { anchoredError } from '../../lib/utils/error.js'
import { dispatch, type Collections, type NodeVerbs } from '../shared/dispatch.js'
import { assertTransition, lifecycleTransitions } from '../shared/transitions.js'
import { nextChild, readyChildren } from '../shared/children.js'
import {
  addQuestion,
  resolveQuestion,
  assertNoOpenQuestions,
  type Question,
} from '../shared/questions.js'
import { appendLog, type LogEntry } from '../shared/log.js'
import { TaskNodeSchema } from './task.schemas.js'

interface PhaseLike {
  slug: string
  status: string
  [k: string]: unknown
}
interface TaskNodeLike extends Node {
  status: string
  phases?: PhaseLike[]
  concerns?: Question[]
  questions?: Question[]
  log?: LogEntry[]
}

// status → done floor: no open concern + every phase terminal-OK (done/deferred). Task has no
// own ACs (its phases carry them); the schema enforces each done-AC's evidence on write.
function assertTaskCompletable(node: TaskNodeLike): void {
  const openConcerns = (node.concerns ?? []).filter((c) => c.status !== 'resolved')
  if (openConcerns.length > 0) {
    throw anchoredError(
      'ConcernsOpen',
      `cannot complete: ${openConcerns.length} open concern(s) — ${openConcerns.map((c) => c.id).join(', ')}`,
      ['resolve them in the wrap concern-walk'],
    )
  }
  const open = (node.phases ?? []).filter((p) => !['done', 'deferred'].includes(p.status))
  if (open.length > 0) {
    throw anchoredError(
      'ChildrenIncomplete',
      `cannot complete: phases not terminal — ${open.map((p) => `${p.slug}:${p.status}`).join(', ')}`,
      ['finish or defer them first (deferred phases do not block)'],
    )
  }
}

// generic set-field: managed collections + status are reserved (only their typed verb writes
// them — a raw `set status done` would bypass the transition + completion guards).
const RESERVED = new Set([
  'status',
  'phases',
  'questions',
  'concerns',
  'log',
  'schema_version',
  'slug',
])

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

export function createTask(deps: { store: StorePort; template: TemplatePort }): Tier {
  const { store, template } = deps
  const read = (slug: string) => store.read(slug, TaskNodeSchema) as Promise<TaskNodeLike>
  const write = (slug: string, node: TaskNodeLike) => store.write(slug, node, TaskNodeSchema)
  const stagePlan = async (stage: string, slug: string) => ({
    ...template.steps('task', stage),
    node: await read(slug),
  })

  const nodeVerbs: NodeVerbs = {
    get: (slug) => read(slug),
    create: (slug, title) =>
      write(slug, {
        schema_version: 2,
        slug,
        title: title ?? slug,
        status: 'plan',
      } as TaskNodeLike),
    plan: (slug) => stagePlan('plan', slug),
    refine: (slug) => stagePlan('refine', slug),
    build: (slug) => stagePlan('build', slug),
    wrap: (slug) => stagePlan('wrap', slug),

    async status(slug, to) {
      const node = await read(slug)
      assertTransition(lifecycleTransitions, node.status, to, 'task')
      if (to === 'build') assertNoOpenQuestions(node.questions ?? [], 'task')
      if (to === 'done') assertTaskCompletable(node)
      return write(slug, { ...node, status: to })
    },

    async set(slug, field, value) {
      const top = field.split('.')[0]!
      if (RESERVED.has(top)) {
        throw anchoredError(
          'ReservedField',
          `field '${top}' is reserved and cannot be set via set`,
          ['use the dedicated verb (status, phase add, question add, …)'],
        )
      }
      const node = await read(slug)
      const path = field.split('.')
      const next = path.length > 1 ? setNested(node, path, value) : { ...node, [field]: value }
      return write(slug, next as TaskNodeLike)
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

  const collections: Collections = {
    // phase EXISTENCE (parent owns child existence + order; the phase module owns content).
    phase: {
      async add(slug, phaseSlug, name) {
        const node = await read(slug)
        const phases = node.phases ?? []
        if (phases.some((p) => p.slug === phaseSlug)) {
          throw anchoredError('DuplicateSlug', `phase '${phaseSlug}' already exists`)
        }
        const phase: PhaseLike = { slug: phaseSlug, name: name ?? phaseSlug, status: 'pending' }
        return write(slug, { ...node, phases: [...phases, phase] })
      },
      async list(slug) {
        return (await read(slug)).phases ?? []
      },
      async next(slug) {
        const phases = ((await read(slug)).phases ?? []) as { slug: string; status: string }[]
        return nextChild(phases)
      },
      async ready(slug) {
        const phases = ((await read(slug)).phases ?? []) as { slug: string; status: string }[]
        return readyChildren(phases)
      },
    },
    question: {
      async add(slug, text, priority) {
        const node = await read(slug)
        const questions = addQuestion((node.questions ?? []) as Question[], {
          text,
          priority: (priority ?? 'medium') as 'low' | 'medium' | 'high',
        })
        return write(slug, { ...node, questions })
      },
      async resolve(slug, id, answer, source, reasoning) {
        const node = await read(slug)
        const questions = resolveQuestion((node.questions ?? []) as Question[], id, {
          answer,
          source: (source ?? 'user') as 'user' | 'ai',
          ...(reasoning !== undefined ? { reasoning } : {}),
        })
        return write(slug, { ...node, questions })
      },
    },
    concern: {
      async add(slug, text, priority) {
        const node = await read(slug)
        const concerns = addQuestion(
          (node.concerns ?? []) as Question[],
          {
            text,
            priority: (priority ?? 'medium') as 'low' | 'medium' | 'high',
          },
          'c',
        )
        return write(slug, { ...node, concerns })
      },
      async resolve(slug, id, answer, source, reasoning) {
        const node = await read(slug)
        const concerns = resolveQuestion((node.concerns ?? []) as Question[], id, {
          answer,
          source: (source ?? 'user') as 'user' | 'ai',
          ...(reasoning !== undefined ? { reasoning } : {}),
        })
        return write(slug, { ...node, concerns })
      },
    },
    log: {
      async add(slug, at, kind, note) {
        const node = await read(slug)
        return write(slug, {
          ...node,
          log: appendLog((node.log ?? []) as LogEntry[], { at, kind, note }),
        })
      },
    },
  }

  return dispatch('task', nodeVerbs, collections, (slug) => read(slug))
}
