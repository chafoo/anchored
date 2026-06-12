// ops/facade.ts — the slug-based NodeOpsFacade the CLI drives. It wraps the
// tier-generic node-ops (read-modify-write through the io seam) behind a flat
// slug→verb surface: read the node, apply the verb, persist. All the await-bearing
// glue lives HERE (not in index.ts, which stays a pure, await-free wiring factory).
import type { NodeOpsFacade } from '../cli/index.js'
import { anchoredError } from '../state/invariants.js'

interface AnyRec {
  slug: string
  status: string
  [k: string]: unknown
}

/** Next free `a<N>` acceptance-criterion id for a phase (a1, a2, …). */
// next a-id for a child's acceptance_criteria. Child-field-generic: a task's child
// is a phase, an epic's child is a task-stub (D2) — both carry acceptance_criteria.
function nextAcId(node: AnyRec, childSlug: string): string {
  type ChildWithAcs = { slug: string; acceptance_criteria?: { id: string }[] }
  const children = [
    ...((node.phases as ChildWithAcs[] | undefined) ?? []),
    ...((node.tasks as ChildWithAcs[] | undefined) ?? []),
  ]
  const acs = children.find((c) => c.slug === childSlug)?.acceptance_criteria ?? []
  const max = acs.reduce((m, ac) => {
    const n = /^a(\d+)$/.exec(ac.id)
    return n ? Math.max(m, Number(n[1])) : m
  }, 0)
  return `a${max + 1}`
}

// the subset of a tier-bound nodeOps this facade needs
export interface TierOps {
  create(init: AnyRec): Promise<AnyRec>
  read(slug: string): Promise<AnyRec>
  setStatus(node: AnyRec, to: string): Promise<AnyRec>
  addChild(node: AnyRec, child: { slug: string; status: string }): Promise<AnyRec>
  setChildField(node: AnyRec, childSlug: string, field: string, value: unknown): Promise<AnyRec>
  setChildStatus(node: AnyRec, childSlug: string, status: string): Promise<AnyRec>
  nextChild(node: AnyRec): unknown
  readyChildren(node: AnyRec): unknown
  addQuestion(
    node: AnyRec,
    init: { text: string; priority: 'low' | 'medium' | 'high' },
  ): Promise<AnyRec>
  resolveQuestion(
    node: AnyRec,
    id: string,
    r: { answer: string; source: 'user' | 'ai'; reasoning?: string },
  ): Promise<AnyRec>
  addConcern(
    node: AnyRec,
    init: { text: string; priority: 'low' | 'medium' | 'high' },
  ): Promise<AnyRec>
  resolveConcern(
    node: AnyRec,
    id: string,
    r: { answer: string; source: 'user' | 'ai'; reasoning?: string },
  ): Promise<AnyRec>
  appendLog(node: AnyRec, e: { at: string; kind: string; note: string }): Promise<AnyRec>
  setField(node: AnyRec, field: string, value: unknown): Promise<AnyRec>
  setExecutor(node: AnyRec, phase: string, value: string): Promise<AnyRec>
  addEvidence(node: AnyRec, acId: string, ev: string[]): Promise<AnyRec>
  addPhase(node: AnyRec, phase: AnyRec): Promise<AnyRec>
  addAc(
    node: AnyRec,
    childSlug: string,
    ac: { id: string; text: string; status?: string },
  ): Promise<AnyRec>
  addAcceptance(node: AnyRec, text: string): Promise<AnyRec>
  setAcceptanceStatus(
    node: AnyRec,
    id: string,
    status: string,
    evidence?: string[],
  ): Promise<AnyRec>
  addChildEvidence(node: AnyRec, childSlug: string, acId: string, ev: string[]): Promise<AnyRec>
  setChildFailures(
    node: AnyRec,
    childSlug: string,
    acId: string,
    failures: string[],
  ): Promise<AnyRec>
  setChildAcStatus(node: AnyRec, childSlug: string, acId: string, status: string): Promise<AnyRec>
  clearChildFailures(node: AnyRec, childSlug: string, acId: string): Promise<AnyRec>
  setPhaseRules(
    node: AnyRec,
    phaseSlug: string,
    rule: { path: string; why: string },
  ): Promise<AnyRec>
}

export interface FacadeDeps {
  /** Pick the tier-bound node-ops for a tier. */
  opsFor: (tier: string) => TierOps
  /** Derive a node's tier from its persisted FILE content (tasks[]→epic,
   *  phases[]→task). The File-Shape is the SSOT — no slug-default guessing. */
  tierFor: (slug: string) => Promise<string>
  /** Default status per tier for a freshly created node. */
  defaultStatus: Record<string, string>
  /** Clock seam — returns an ISO date string for the `created` field. Injected
   *  (the bin provides real time) so the core stays Date.now-free + fakeable. */
  now?: () => string
  /** Path of a node's task-file. Lifecycle ops (archive/reset) relocate/delete the
   *  file by path, so they need it directly (the tier-ops keep it internal). */
  pathFor: (slug: string) => string
  /** The io seam's whole-file ops (move/remove) + a raw read for existence checks.
   *  archive/reset bypass the validating tier-ops on purpose — they move/delete the
   *  file as a unit, they don't mutate its contents. */
  io: {
    readFile(path: string): Promise<string>
    move(from: string, to: string): Promise<void>
    remove(path: string): Promise<void>
  }
}

/** Build the slug-based facade over the injected tier-ops. */
export function createSlugFacade(deps: FacadeDeps): NodeOpsFacade {
  const { opsFor, tierFor, defaultStatus, now, pathFor, io } = deps
  // archive path = the task-file's dir + `archive/<slug>.yml`. Derived from pathFor
  // (replace the final `<slug>.yml` segment) so it tracks whatever layout pathFor
  // produces — no hardcoded `.claude/tasks` here.
  const archivePathFor = (slug: string): string => {
    const path = pathFor(slug)
    const i = path.lastIndexOf('/')
    return i < 0 ? `archive/${path}` : `${path.slice(0, i)}/archive/${path.slice(i + 1)}`
  }
  // existence guard — both lifecycle ops must fail LOUD on a missing node (never a
  // silent no-op). A successful raw read proves the file is there before we touch it.
  const requireExists = async (slug: string): Promise<void> => {
    try {
      await io.readFile(pathFor(slug))
    } catch {
      throw anchoredError('UnknownNode', `no node '${slug}' to operate on`, [
        `nothing at ${pathFor(slug)} — check the slug`,
      ])
    }
  }
  return {
    create: async (slug, init) => {
      // create is told its tier explicitly (the file doesn't exist yet to derive
      // from). It seeds the tier-shape so later reads derive the tier from content.
      const tier = (init.tier as string) ?? 'task'
      const rest = { ...init }
      delete (rest as Record<string, unknown>).tier // tier is NOT a stored field (derived from shape)
      const base: AnyRec = { slug, status: defaultStatus[tier] ?? 'plan' }
      if (tier !== 'phase') {
        base.schema_version = 2
        base.title = (rest.title as string) ?? slug
        if (now) base.created = now() // stamped via the injected clock seam
      }
      if (tier === 'epic') base.tasks = [] // seed epic shape → reads derive 'epic'
      return opsFor(tier).create({ ...base, ...rest } as AnyRec)
    },
    read: async (slug) => opsFor(await tierFor(slug)).read(slug),
    // archive — freeze the task-file out of the active set: MOVE it to archive/<slug>.yml.
    // The substrate touch only; git (branch cleanup) is the command's job (it has `run`).
    archive: async (slug) => {
      await requireExists(slug)
      const to = archivePathFor(slug)
      await io.move(pathFor(slug), to)
      return { slug, archived: true, to }
    },
    // reset — back to before the task existed: REMOVE the task-file entirely.
    reset: async (slug) => {
      await requireExists(slug)
      await io.remove(pathFor(slug))
      return { slug, reset: true }
    },
    setStatus: async (slug, status) => {
      const o = opsFor(await tierFor(slug))
      return o.setStatus(await o.read(slug), status)
    },
    addChild: async (slug, child) => {
      const o = opsFor(await tierFor(slug))
      return o.addChild(await o.read(slug), {
        slug: child.slug,
        status: 'pending',
        ...(child.goal !== undefined ? { goal: child.goal } : {}),
        // F2: seed the DAG edge at creation so the scaffold agent doesn't need a
        // second call (and can't "claim" a depends_on it never wrote).
        ...(child.depends_on !== undefined ? { depends_on: child.depends_on } : {}),
      } as { slug: string; status: string })
    },
    setChildField: async (slug, childSlug, field, value) => {
      const o = opsFor(await tierFor(slug))
      return o.setChildField(await o.read(slug), childSlug, field, value)
    },
    nextChild: async (slug) => {
      const o = opsFor(await tierFor(slug))
      return o.nextChild(await o.read(slug))
    },
    readyChildren: async (slug) => {
      const o = opsFor(await tierFor(slug))
      return o.readyChildren(await o.read(slug))
    },
    addQuestion: async (slug, q) => {
      const o = opsFor(await tierFor(slug))
      return o.addQuestion(await o.read(slug), {
        text: q.text,
        priority: q.priority as 'low' | 'medium' | 'high',
      })
    },
    resolveQuestion: async (slug, id, r) => {
      const o = opsFor(await tierFor(slug))
      return o.resolveQuestion(await o.read(slug), id, {
        answer: r.answer,
        source: r.source as 'user' | 'ai',
        ...(r.reasoning !== undefined ? { reasoning: r.reasoning } : {}),
      })
    },
    addConcern: async (slug, q) => {
      const o = opsFor(await tierFor(slug))
      return o.addConcern(await o.read(slug), {
        text: q.text,
        priority: q.priority as 'low' | 'medium' | 'high',
      })
    },
    resolveConcern: async (slug, id, r) => {
      const o = opsFor(await tierFor(slug))
      return o.resolveConcern(await o.read(slug), id, {
        answer: r.answer,
        source: r.source as 'user' | 'ai',
        ...(r.reasoning !== undefined ? { reasoning: r.reasoning } : {}),
      })
    },
    appendLog: async (slug, e) => {
      const o = opsFor(await tierFor(slug))
      return o.appendLog(await o.read(slug), e)
    },
    setField: async (slug, field, value) => {
      const o = opsFor(await tierFor(slug))
      // route through node-ops.setField so the reserved-field guard applies
      return o.setField(await o.read(slug), field, value)
    },
    setExecutor: async (slug, phase, value) => {
      const o = opsFor(await tierFor(slug))
      return o.setExecutor(await o.read(slug), phase, value)
    },
    addEvidence: async (slug, acId, text) => {
      const o = opsFor(await tierFor(slug))
      return o.addEvidence(await o.read(slug), acId, [text])
    },
    addPhase: async (slug, phase) => {
      const o = opsFor(await tierFor(slug))
      return o.addPhase(await o.read(slug), {
        slug: phase.slug,
        status: 'pending',
        ...(phase.name !== undefined ? { name: phase.name } : {}),
      } as AnyRec)
    },
    addAc: async (slug, phase, ac) => {
      const o = opsFor(await tierFor(slug))
      const node = await o.read(slug)
      // auto-assign the next a-id when the caller didn't pass one (agent-ergonomic)
      const id = ac.id ?? nextAcId(node, phase)
      return o.addAc(node, phase, { id, status: 'pending', text: ac.text })
    },
    addAcceptance: async (slug, text) => {
      const o = opsFor(await tierFor(slug))
      return o.addAcceptance(await o.read(slug), text)
    },
    setAcceptanceStatus: async (slug, id, status, evidence) => {
      const o = opsFor(await tierFor(slug))
      return o.setAcceptanceStatus(await o.read(slug), id, status, evidence)
    },
    setChildStatus: async (slug, childSlug, status) => {
      const o = opsFor(await tierFor(slug))
      return o.setChildStatus(await o.read(slug), childSlug, status)
    },
    addChildEvidence: async (slug, phase, acId, text) => {
      const o = opsFor(await tierFor(slug))
      return o.addChildEvidence(await o.read(slug), phase, acId, [text])
    },
    setChildFailures: async (slug, phase, acId, text) => {
      const o = opsFor(await tierFor(slug))
      return o.setChildFailures(await o.read(slug), phase, acId, [text])
    },
    clearChildFailures: async (slug, phase, acId) => {
      const o = opsFor(await tierFor(slug))
      return o.clearChildFailures(await o.read(slug), phase, acId)
    },
    setChildAcStatus: async (slug, phase, acId, status) => {
      const o = opsFor(await tierFor(slug))
      return o.setChildAcStatus(await o.read(slug), phase, acId, status)
    },
    setPhaseRules: async (slug, phase, path, why) => {
      const o = opsFor(await tierFor(slug))
      return o.setPhaseRules(await o.read(slug), phase, { path, why })
    },
  }
}
