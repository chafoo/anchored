// store/node-store/node-store.ts — createNodeOps(tierSchema, deps): ONE tier-generic op kernel,
// parametrised over the tier descriptor (no per-tier duplication). Every mutation
// is read-modify-write through the injected io.atomicWrite seam (no partial state).
// The hard invariant (no ac→done without evidence) and forward-only transitions
// are enforced HERE, at the writing op. Pure substrate functions (assert*) are
// imported directly; the only effect (io) is injected.
import { assertTransition } from '../transitions/transitions.js'
import {
  assertAcDoneHasEvidence,
  assertEpicAcHasEvidence,
  assertNodeCompletable,
} from '../invariants/invariants.js'
import { anchoredError, type AnchoredError } from '../../../lib/utils/error.js'
import {
  nextChild as nextChildOf,
  readyChildren as readyChildrenOf,
  addChild as addChildOf,
  moveChild as moveChildOf,
  type ChildLike,
} from '../children/children.js'
import {
  addQuestion as addQuestionOf,
  resolveQuestion as resolveQuestionOf,
  type QuestionInit,
  type QuestionResolution,
  type Question,
} from '../questions/questions.js'
import { appendLog as appendLogOf, type LogEntry } from '../log.js'
import type { TierCondition } from '../../../lib/contracts/tier.js'

// The store is told its tier entirely through the injected condition bundle — it
// imports no module. Everything formerly hardcoded by child-tier (the child field,
// the child status axis, the terminal-OK set, the executor axis, the transitions)
// now rides on the descriptor (a `modules/<tier>` export, injected at the root).
export type TierDescriptor = TierCondition

export interface NodeOpsDeps {
  io: {
    atomicWrite(path: string, content: string, expectedVersion?: string): Promise<void>
    readFile(path: string): Promise<string>
    // M4: a version token captured at read, checked at write (compare-and-swap).
    // Optional — a fake io without it disables CAS (single-writer tests).
    statVersion?(path: string): Promise<string | undefined>
  }
  render: (node: unknown) => string
  parse: (raw: string) => unknown
  pathFor: (slug: string) => string
}

// M4: a transient version marker that rides a node from read → persist, invisible
// to the schema (strictObject ignores symbol keys) and to render (JSON/YAML ignore
// symbols). persist passes it to atomicWrite for the compare-and-swap.
const VERSION = Symbol('anchored.version')

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
//
// Q1 (harden-1): `status` is reserved too — a raw `set-field <slug> status done`
// would teleport a node plan→done with NO evidence and NO transition check (it goes
// through blank persist(), bypassing assertTransition + assertNodeCompletable). All
// status changes MUST go through setStatus. The managed collections (acceptance_*,
// evidence, failures, phases, tasks, questions, log) are owned by dedicated
// validating ops and must never be blind-overwritten via the generic set-field.
const RESERVED_FIELDS = new Set([
  'executor',
  'status',
  'acceptance_criteria',
  'acceptance',
  'evidence',
  'failures',
  'phases',
  'tasks',
  'questions',
  'log',
])

/** Flatten a thrown schema error (ZodError-shaped) into a typed, located
 *  AnchoredError so a rejected write reads like every other CLI op — tier + slug
 *  + the first offending field path — not a raw stack. */
function asInvalidNodeError(tier: string, slug: string, err: unknown): AnchoredError {
  const issues = (err as { issues?: Array<{ path: Array<string | number>; message: string }> })
    .issues
  if (Array.isArray(issues) && issues.length > 0) {
    const first = issues[0]!
    const where = first.path.length > 0 ? first.path.join('.') : '(root)'
    return anchoredError(
      'InvalidNode',
      `${tier} '${slug}' is invalid at ${where}: ${first.message}`,
      ['the mutation produced a node that violates the tier schema — no write was performed'],
    )
  }
  return anchoredError('InvalidNode', `${tier} '${slug}' is invalid: ${(err as Error).message}`)
}

export function createNodeOps(tierSchema: TierDescriptor, deps: NodeOpsDeps) {
  const { io, render, parse, pathFor } = deps
  const childField = tierSchema.childField

  const persist = async (node: AnyNode): Promise<AnyNode> => {
    // Fail-closed: validate the post-mutation node against its tier schema BEFORE
    // writing. An invalid mutation must surface HERE, at the writing op — never
    // brick the node for the next reader (the G1 integrity hole). Validate purely
    // as a guard; write the ORIGINAL node (render(node)) so we never silently
    // rewrite the on-disk shape to the parsed projection.
    try {
      tierSchema.schema.parse(node)
    } catch (err) {
      throw asInvalidNodeError(tierSchema.tier, node.slug, err)
    }
    // M4: thread the read-time version (if any) into the write for compare-and-swap.
    const expectedVersion = (node as unknown as Record<symbol, unknown>)[VERSION] as
      | string
      | undefined
    await io.atomicWrite(pathFor(node.slug), render(node), expectedVersion)
    return node
  }
  // H4: when an AC flips to `done` after a failures-driven redo, retire its
  // transient `failures` log — a passed AC must never read as still-failed. The
  // rejection survives in the node's log[]; the live `failures` slot is cleared.
  const retireFailures = (ac: Ac): Ac => {
    if (!('failures' in ac)) return ac
    const next = { ...(ac as Record<string, unknown>) }
    delete next.failures
    return next as unknown as Ac
  }
  const childrenOf = (node: AnyNode): ChildLike[] =>
    childField ? ((node[childField] as ChildLike[] | undefined) ?? []) : []
  const requireChildField = (): string => {
    if (!childField) throw anchoredError('LeafTier', `tier '${tierSchema.tier}' has no children`)
    return childField
  }

  return {
    async read(slug: string): Promise<AnyNode> {
      const path = pathFor(slug)
      const node = parse(await io.readFile(path)) as AnyNode
      // M4: stamp the file's version onto the node (symbol key → invisible to schema
      // + render) so the eventual persist can compare-and-swap against it.
      if (io.statVersion) {
        const v = await io.statVersion(path)
        if (v !== undefined) (node as unknown as Record<symbol, unknown>)[VERSION] = v
      }
      return node
    },

    async create(init: AnyNode): Promise<AnyNode> {
      return persist({ ...init })
    },

    async setStatus(node: AnyNode, to: string): Promise<AnyNode> {
      assertTransition(tierSchema, node.status, to)
      if (to === 'done') {
        // completing a node requires every acceptance criterion to be evidence-backed
        assertNodeCompletable(node)
        // harden-3: …AND no open concern (the "check at the end" floor — nothing
        // unaddressed slips past done; concerns are walked + resolved at wrap).
        const openConcerns = (
          (node.concerns as { id: string; status: string }[] | undefined) ?? []
        ).filter((c) => c.status !== 'resolved')
        if (openConcerns.length > 0) {
          throw anchoredError(
            'ConcernsOpen',
            `cannot complete '${node.slug}': ${openConcerns.length} open concern(s) — ` +
              openConcerns.map((c) => c.id).join(', '),
            [`resolve them in the wrap concern-walk (resolve-concern <slug> <id> <answer>)`],
          )
        }
        // M1: …AND every child terminal-OK (no pending/active/in-progress/blocked).
        // task/epic have no own ACs, so without this their done was a vacuum pass —
        // an epic could complete with a still-pending task-stub.
        if (childField && tierSchema.childTier) {
          const ok = tierSchema.childTerminalOk ?? ['done']
          const open = childrenOf(node).filter((c) => !ok.includes(c.status))
          if (open.length > 0) {
            throw anchoredError(
              'ChildrenIncomplete',
              `cannot complete '${node.slug}': children not terminal — ` +
                open.map((c) => `${c.slug}:${c.status}`).join(', '),
              [`finish or defer them first (deferred children don't block; blocked ones do)`],
            )
          }
        }
      }
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

    // H7: the node's OWN acceptance[] — the epic/project-tier integration DoD (NOT a
    // child's acceptance_criteria). epic-decompose authors a whole-epic integration
    // AC here; the roll-up validates + flips it. Auto-ids e1, e2, … (status pending).
    async addAcceptance(node: AnyNode, text: string): Promise<AnyNode> {
      const items = (node.acceptance as { id: string }[] | undefined) ?? []
      const max = items.reduce((m, a) => {
        const n = /^e(\d+)$/.exec(a.id)
        return n ? Math.max(m, Number(n[1])) : m
      }, 0)
      return persist({
        ...node,
        acceptance: [...items, { id: `e${max + 1}`, text, status: 'pending' }],
      })
    },

    async setAcceptanceStatus(
      node: AnyNode,
      id: string,
      status: string,
      evidence?: string[],
    ): Promise<AnyNode> {
      const items = (node.acceptance as { id: string; evidence?: string[] }[] | undefined) ?? []
      const item = items.find((a) => a.id === id)
      if (!item) throw anchoredError('UnknownAcceptance', `no acceptance item '${id}'`)
      // M3: an epic DoD item only flips done WITH delivery evidence (passed now or
      // already present) — same evidence-honesty floor as a phase AC, one tier up.
      const merged =
        evidence && evidence.length > 0 ? [...(item.evidence ?? []), ...evidence] : item.evidence
      assertEpicAcHasEvidence(id, status, merged)
      return persist({
        ...node,
        acceptance: items.map((a) =>
          a.id === id ? { ...a, status, ...(merged ? { evidence: merged } : {}) } : a,
        ),
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
          a.id === acId ? retireFailures({ ...a, evidence, status: 'done' }) : a,
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

    // H4: explicitly clear a CHILD AC's transient failures (status untouched). The
    // redo path retires failures on the done-flip automatically; this verb is the
    // manual escape hatch (the workaround that hit UnknownNodeVerb in the dogfood).
    async clearChildFailures(node: AnyNode, childSlug: string, acId: string): Promise<AnyNode> {
      const field = requireChildField()
      const children = (node[field] as AnyNode[] | undefined) ?? []
      const child = children.find((c) => c.slug === childSlug)
      if (!child) throw anchoredError('UnknownChild', `no child '${childSlug}'`)
      const acs = (child.acceptance_criteria as Ac[] | undefined) ?? []
      if (!acs.some((a) => a.id === acId))
        throw anchoredError('UnknownAc', `no acceptance criterion '${acId}' on '${childSlug}'`)
      const updated = {
        ...child,
        acceptance_criteria: acs.map((a) => (a.id === acId ? retireFailures(a) : a)),
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
        acceptance_criteria: acs.map((a) =>
          a.id === acId
            ? status === 'done'
              ? retireFailures({ ...a, status })
              : { ...a, status }
            : a,
        ),
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
      // enum-validate first — a bogus value throws and NOTHING is written. The valid
      // executor axis rides on the descriptor (the task tier's childExecutorValues).
      const executorValues = tierSchema.childExecutorValues ?? []
      if (!executorValues.includes(value)) {
        throw anchoredError(
          'InvalidExecutor',
          `executor must be one of ${executorValues.join(' | ')} (got '${value}')`,
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
      // evidence now present → flip the AC to done atomically (single write);
      // retire any prior failures (H4) — it re-passed, so it isn't failed anymore
      return persist({
        ...node,
        acceptance_criteria: acs.map((a) =>
          a.id === acId ? retireFailures({ ...a, evidence, status: 'done' }) : a,
        ),
      })
    },

    nextChild(node: AnyNode): ChildLike | null {
      return childField ? nextChildOf(childrenOf(node)) : null
    },

    readyChildren(node: AnyNode): ChildLike[] {
      return childField ? readyChildrenOf(childrenOf(node)) : []
    },

    async addChild(node: AnyNode, child: ChildLike): Promise<AnyNode> {
      const field = requireChildField()
      return persist({ ...node, [field]: addChildOf(childrenOf(node), child) })
    },

    // F2: set ANY field on a child stub/phase by slug (goal, depends_on, …) — the
    // generic set-field can't address an array element, so the DAG edge had no CLI
    // setter and had to be hand-edited. persist re-validates the whole node, so an
    // illegal child shape is rejected before any write.
    async setChildField(
      node: AnyNode,
      childSlug: string,
      field: string,
      value: unknown,
    ): Promise<AnyNode> {
      const cf = requireChildField()
      // Q1: a child's `status` must go through setChildStatus (enum-guarded, and the
      // completion checks land there) — never the generic child-field path. Same for
      // the managed per-child collections.
      const top = field.split('.')[0]!
      if (RESERVED_FIELDS.has(top)) {
        throw anchoredError(
          'ReservedField',
          `child field '${top}' is reserved and cannot be set via set-child-field`,
          [`use the dedicated op (e.g. set-child-status for 'status')`],
        )
      }
      const children = (node[cf] as AnyNode[] | undefined) ?? []
      const child = children.find((c) => c.slug === childSlug)
      if (!child) throw anchoredError('UnknownChild', `no child '${childSlug}'`)
      return persist({
        ...node,
        [cf]: children.map((c) => (c.slug === childSlug ? { ...c, [field]: value } : c)),
      })
    },

    async moveChild(node: AnyNode, slug: string, toIndex: number): Promise<AnyNode> {
      const field = requireChildField()
      return persist({ ...node, [field]: moveChildOf(childrenOf(node), slug, toIndex) })
    },

    async setChildStatus(node: AnyNode, childSlug: string, status: string): Promise<AnyNode> {
      const field = requireChildField()
      // G2 — guard the value against the child tier's status enum BEFORE the write,
      // so an illegal word (e.g. the phase-only 'in-progress' on an epic task-stub,
      // which bricked an epic in the dogfood) fails with a clear, located error.
      const allowed = tierSchema.childStatusValues ?? []
      if (!allowed.includes(status)) {
        throw anchoredError(
          'InvalidChildStatus',
          `'${status}' is not a valid ${tierSchema.childTier} status`,
          [...allowed],
        )
      }
      // M2 (harden-2): flipping a child to `done` requires its OWN acceptance criteria
      // to be complete (and the AC-evidence invariant already guarantees each done AC
      // has evidence). Without this, the orchestrator could mark a phase/stub done
      // with a pending AC — gate-ordering rested purely on orchestrator discipline.
      if (status === 'done') {
        const child = childrenOf(node).find((c) => c.slug === childSlug)
        if (!child) throw anchoredError('UnknownChild', `no child '${childSlug}'`)
        const acs = (child as { acceptance_criteria?: { id: string; status: string }[] })
          .acceptance_criteria
        const openAcs = (acs ?? []).filter((a) => a.status !== 'done')
        if (openAcs.length > 0) {
          throw anchoredError(
            'ChildIncomplete',
            `cannot mark '${childSlug}' done: acceptance criteria not done — ` +
              openAcs.map((a) => a.id).join(', '),
            [`evidence each AC first (add-phase-evidence flips it done atomically)`],
          )
        }
      }
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

    // harden-3: concerns reuse the question machinery on a separate `concerns`
    // field — raised during build, resolved in the wrap concern-walk. setStatus
    // blocks `done` while any concern is open (below).
    async addConcern(node: AnyNode, init: QuestionInit): Promise<AnyNode> {
      const concerns = (node.concerns as Question[] | undefined) ?? []
      return persist({ ...node, concerns: addQuestionOf(concerns, init, 'c') })
    },
    async resolveConcern(node: AnyNode, id: string, r: QuestionResolution): Promise<AnyNode> {
      const concerns = (node.concerns as Question[] | undefined) ?? []
      return persist({ ...node, concerns: resolveQuestionOf(concerns, id, r) })
    },

    async appendLog(node: AnyNode, entry: LogEntry): Promise<AnyNode> {
      const log = (node.log as LogEntry[] | undefined) ?? []
      return persist({ ...node, log: appendLogOf(log, entry) })
    },
  }
}
