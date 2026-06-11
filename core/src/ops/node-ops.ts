// ops/node-ops.ts — createNodeOps(tierSchema, deps): ONE tier-generic op kernel,
// parametrised over the tier descriptor (no per-tier duplication). Every mutation
// is read-modify-write through the injected io.atomicWrite seam (no partial state).
// The hard invariant (no ac→done without evidence) and forward-only transitions
// are enforced HERE, at the writing op. Pure substrate functions (assert*) are
// imported directly; the only effect (io) is injected.
import { assertTransition } from '../state/transitions.js'
import {
  assertAcDoneHasEvidence,
  assertNodeCompletable,
  anchoredError,
} from '../state/invariants.js'
import {
  nextChild as nextChildOf,
  addChild as addChildOf,
  moveChild as moveChildOf,
  type ChildLike,
} from './scope/children.js'
import {
  addQuestion as addQuestionOf,
  resolveQuestion as resolveQuestionOf,
  type QuestionInit,
  type QuestionResolution,
  type Question,
} from './scope/questions.js'
import { appendLog as appendLogOf, type LogEntry } from './scope/log.js'
import { phaseExecutorValues } from '../schema/tiers/phase.js'

export interface TierDescriptor {
  tier: string
  statusEnum: readonly string[]
  childTier: string | undefined
  schema: { parse(input: unknown): unknown }
}

export interface NodeOpsDeps {
  io: {
    atomicWrite(path: string, content: string): Promise<void>
    readFile(path: string): Promise<string>
  }
  render: (node: unknown) => string
  parse: (raw: string) => unknown
  pathFor: (slug: string) => string
}

interface Ac {
  id: string
  status: string
  evidence?: string[]
}
interface AnyNode {
  slug: string
  status: string
  acceptance_criteria?: Ac[]
  [k: string]: unknown
}

const CHILD_FIELD: Record<string, string> = { phase: 'phases', task: 'tasks', epic: 'epics' }

/** Immutably set a nested field by path (e.g. ['context','wrap']). Used by
 *  set-field's dotted-path form so a worker can write context.wrap without
 *  clobbering its siblings (context.plan/refine/build). */
function setNested(obj: Record<string, unknown>, path: string[], value: unknown): AnyNode {
  const [head, ...rest] = path as [string, ...string[]]
  if (rest.length === 0) return { ...obj, [head]: value } as AnyNode
  const cur = obj[head]
  const child = cur && typeof cur === 'object' ? (cur as Record<string, unknown>) : {}
  return { ...obj, [head]: setNested(child, rest, value) } as AnyNode
}

// Reserved fields: scheduling/mechanism fields a generic `set-field` must never
// touch, so a user-supplied custom field can't shadow them. `executor` is owned
// solely by setExecutor (enum-validated, written on its target phase).
const RESERVED_FIELDS = new Set(['executor'])

export function createNodeOps(tierSchema: TierDescriptor, deps: NodeOpsDeps) {
  const { io, render, parse, pathFor } = deps
  const childField = tierSchema.childTier ? CHILD_FIELD[tierSchema.childTier] : undefined

  const persist = async (node: AnyNode): Promise<AnyNode> => {
    await io.atomicWrite(pathFor(node.slug), render(node))
    return node
  }
  const childrenOf = (node: AnyNode): ChildLike[] =>
    childField ? ((node[childField] as ChildLike[] | undefined) ?? []) : []
  const requireChildField = (): string => {
    if (!childField) throw anchoredError('LeafTier', `tier '${tierSchema.tier}' has no children`)
    return childField
  }

  return {
    async read(slug: string): Promise<AnyNode> {
      return parse(await io.readFile(pathFor(slug))) as AnyNode
    },

    async create(init: AnyNode): Promise<AnyNode> {
      return persist({ ...init })
    },

    async setStatus(node: AnyNode, to: string): Promise<AnyNode> {
      assertTransition(tierSchema, node.status, to)
      // completing a node requires every acceptance criterion to be evidence-backed
      if (to === 'done') assertNodeCompletable(node)
      return persist({ ...node, status: to })
    },

    async setAcStatus(node: AnyNode, acId: string, status: string): Promise<AnyNode> {
      const acs = node.acceptance_criteria ?? []
      const ac = acs.find((a) => a.id === acId)
      if (!ac) throw anchoredError('UnknownAc', `no acceptance criterion '${acId}'`)
      // hard invariant — runs BEFORE any write, so an illegal done never persists
      if (status === 'done') assertAcDoneHasEvidence({ ...ac, status: 'done' })
      return persist({
        ...node,
        acceptance_criteria: acs.map((a) => (a.id === acId ? { ...a, status } : a)),
      })
    },

    async setField(node: AnyNode, field: string, value: unknown): Promise<AnyNode> {
      // reserved fields (e.g. executor) cannot be set through the generic path —
      // only their typed op may write them. Throws BEFORE any write. The reserved
      // check is on the TOP segment so a dotted path can't shadow a reserved field.
      const top = field.split('.')[0]!
      if (RESERVED_FIELDS.has(top)) {
        throw anchoredError(
          'ReservedField',
          `field '${top}' is reserved and cannot be set via set-field`,
          [`use the dedicated op (e.g. set-executor for 'executor')`],
        )
      }
      // dotted path (e.g. context.wrap) → set nested, immutably; bare → top-level
      const path = field.split('.')
      return persist(path.length > 1 ? setNested(node, path, value) : { ...node, [field]: value })
    },

    async addPhase(node: AnyNode, phase: AnyNode): Promise<AnyNode> {
      const field = requireChildField()
      const children = (node[field] as AnyNode[] | undefined) ?? []
      if (children.some((c) => c.slug === phase.slug)) {
        throw anchoredError('DuplicateSlug', `child '${phase.slug}' already exists`)
      }
      return persist({
        ...node,
        [field]: [...children, { ...phase, status: phase.status ?? 'pending' }],
      })
    },

    async addAc(
      node: AnyNode,
      childSlug: string,
      ac: { id: string; text: string; status?: string },
    ): Promise<AnyNode> {
      const field = requireChildField()
      const children = (node[field] as AnyNode[] | undefined) ?? []
      const child = children.find((c) => c.slug === childSlug)
      if (!child) throw anchoredError('UnknownChild', `no child '${childSlug}'`)
      const acs = (child.acceptance_criteria as Ac[] | undefined) ?? []
      if (acs.some((a) => a.id === ac.id)) {
        throw anchoredError('DuplicateAc', `acceptance criterion '${ac.id}' already exists`)
      }
      const updated = {
        ...child,
        acceptance_criteria: [...acs, { ...ac, status: ac.status ?? 'pending' }],
      }
      return persist({
        ...node,
        [field]: children.map((c) => (c.slug === childSlug ? updated : c)),
      })
    },

    // phase-scoped evidence: the write a phase-worker makes (the leaf has no own
    // file). Adds evidence to a CHILD phase's AC and flips it done atomically —
    // the same invariant as addEvidence, one tier down.
    async addChildEvidence(
      node: AnyNode,
      childSlug: string,
      acId: string,
      ev: string[],
    ): Promise<AnyNode> {
      const field = requireChildField()
      const children = (node[field] as AnyNode[] | undefined) ?? []
      const child = children.find((c) => c.slug === childSlug)
      if (!child) throw anchoredError('UnknownChild', `no child '${childSlug}'`)
      const acs = (child.acceptance_criteria as Ac[] | undefined) ?? []
      const ac = acs.find((a) => a.id === acId)
      if (!ac)
        throw anchoredError('UnknownAc', `no acceptance criterion '${acId}' on '${childSlug}'`)
      const evidence = [...(ac.evidence ?? []), ...ev]
      const updated = {
        ...child,
        acceptance_criteria: acs.map((a) =>
          a.id === acId ? { ...a, evidence, status: 'done' } : a,
        ),
      }
      return persist({
        ...node,
        [field]: children.map((c) => (c.slug === childSlug ? updated : c)),
      })
    },

    // phase-scoped failures: a gate rejecting a CHILD phase's AC writes failures
    // and flips it back to pending — the prior evidence stays as history. This is
    // the write that makes the failures-driven re-do loop work.
    async setChildFailures(
      node: AnyNode,
      childSlug: string,
      acId: string,
      failures: string[],
    ): Promise<AnyNode> {
      const field = requireChildField()
      const children = (node[field] as AnyNode[] | undefined) ?? []
      const child = children.find((c) => c.slug === childSlug)
      if (!child) throw anchoredError('UnknownChild', `no child '${childSlug}'`)
      const acs = (child.acceptance_criteria as Ac[] | undefined) ?? []
      if (!acs.some((a) => a.id === acId))
        throw anchoredError('UnknownAc', `no acceptance criterion '${acId}' on '${childSlug}'`)
      const updated = {
        ...child,
        acceptance_criteria: acs.map((a) =>
          a.id === acId ? { ...a, failures, status: 'pending' } : a,
        ),
      }
      return persist({
        ...node,
        [field]: children.map((c) => (c.slug === childSlug ? updated : c)),
      })
    },

    // flip a CHILD phase's AC status (e.g. done→pending for a re-do). The hard
    // invariant still guards: setting an AC to done requires evidence.
    async setChildAcStatus(
      node: AnyNode,
      childSlug: string,
      acId: string,
      status: string,
    ): Promise<AnyNode> {
      const field = requireChildField()
      const children = (node[field] as AnyNode[] | undefined) ?? []
      const child = children.find((c) => c.slug === childSlug)
      if (!child) throw anchoredError('UnknownChild', `no child '${childSlug}'`)
      const acs = (child.acceptance_criteria as Ac[] | undefined) ?? []
      const ac = acs.find((a) => a.id === acId)
      if (!ac)
        throw anchoredError('UnknownAc', `no acceptance criterion '${acId}' on '${childSlug}'`)
      if (status === 'done') assertAcDoneHasEvidence({ ...ac, status: 'done' })
      const updated = {
        ...child,
        acceptance_criteria: acs.map((a) => (a.id === acId ? { ...a, status } : a)),
      }
      return persist({
        ...node,
        [field]: children.map((c) => (c.slug === childSlug ? updated : c)),
      })
    },

    // attach/replace a rule {path, why} on a CHILD phase's `rules` array (dedup by
    // path) — so phases carry real rules the code-validate gate checks against.
    async setPhaseRules(
      node: AnyNode,
      phaseSlug: string,
      rule: { path: string; why: string },
    ): Promise<AnyNode> {
      const field = requireChildField()
      const children = (node[field] as AnyNode[] | undefined) ?? []
      const child = children.find((c) => c.slug === phaseSlug)
      if (!child) throw anchoredError('UnknownChild', `no child '${phaseSlug}'`)
      const rules = (child.rules as { path: string; why: string }[] | undefined) ?? []
      const next = rules.some((r) => r.path === rule.path)
        ? rules.map((r) => (r.path === rule.path ? rule : r))
        : [...rules, rule]
      const updated = { ...child, rules: next }
      return persist({
        ...node,
        [field]: children.map((c) => (c.slug === phaseSlug ? updated : c)),
      })
    },

    async setExecutor(node: AnyNode, phaseRef: string, value: string): Promise<AnyNode> {
      // enum-validate first — a bogus value throws and NOTHING is written
      if (!(phaseExecutorValues as readonly string[]).includes(value)) {
        throw anchoredError(
          'InvalidExecutor',
          `executor must be one of ${phaseExecutorValues.join(' | ')} (got '${value}')`,
        )
      }
      const field = requireChildField()
      const children = childrenOf(node)
      const target = children.find((c) => c.slug === phaseRef)
      if (!target) throw anchoredError('UnknownChild', `no phase '${phaseRef}'`)
      return persist({
        ...node,
        [field]: children.map((c) => (c.slug === phaseRef ? { ...c, executor: value } : c)),
      })
    },

    async addEvidence(node: AnyNode, acId: string, ev: string[]): Promise<AnyNode> {
      const acs = node.acceptance_criteria ?? []
      const ac = acs.find((a) => a.id === acId)
      if (!ac) throw anchoredError('UnknownAc', `no acceptance criterion '${acId}'`)
      const evidence = [...(ac.evidence ?? []), ...ev]
      // evidence now present → flip the AC to done atomically (single write)
      return persist({
        ...node,
        acceptance_criteria: acs.map((a) =>
          a.id === acId ? { ...a, evidence, status: 'done' } : a,
        ),
      })
    },

    nextChild(node: AnyNode): ChildLike | null {
      return childField ? nextChildOf(childrenOf(node)) : null
    },

    async addChild(node: AnyNode, child: ChildLike): Promise<AnyNode> {
      const field = requireChildField()
      return persist({ ...node, [field]: addChildOf(childrenOf(node), child) })
    },

    async moveChild(node: AnyNode, slug: string, toIndex: number): Promise<AnyNode> {
      const field = requireChildField()
      return persist({ ...node, [field]: moveChildOf(childrenOf(node), slug, toIndex) })
    },

    async setChildStatus(node: AnyNode, childSlug: string, status: string): Promise<AnyNode> {
      const field = requireChildField()
      const children = childrenOf(node).map((c) => (c.slug === childSlug ? { ...c, status } : c))
      return persist({ ...node, [field]: children })
    },

    async addQuestion(node: AnyNode, init: QuestionInit): Promise<AnyNode> {
      const questions = (node.questions as Question[] | undefined) ?? []
      return persist({ ...node, questions: addQuestionOf(questions, init) })
    },

    async resolveQuestion(node: AnyNode, id: string, r: QuestionResolution): Promise<AnyNode> {
      const questions = (node.questions as Question[] | undefined) ?? []
      return persist({ ...node, questions: resolveQuestionOf(questions, id, r) })
    },

    async appendLog(node: AnyNode, entry: LogEntry): Promise<AnyNode> {
      const log = (node.log as LogEntry[] | undefined) ?? []
      return persist({ ...node, log: appendLogOf(log, entry) })
    },
  }
}
