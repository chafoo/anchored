// ops/facade.ts — the slug-based NodeOpsFacade the CLI drives. It wraps the
// tier-generic node-ops (read-modify-write through the io seam) behind a flat
// slug→verb surface: read the node, apply the verb, persist. All the await-bearing
// glue lives HERE (not in index.ts, which stays a pure, await-free wiring factory).
import type { NodeOpsFacade } from '../cli/index.js'

interface AnyRec {
  slug: string
  status: string
  [k: string]: unknown
}

/** Next free `a<N>` acceptance-criterion id for a phase (a1, a2, …). */
function nextAcId(node: AnyRec, phaseSlug: string): string {
  const phases = (node.phases as { slug: string; acceptance_criteria?: { id: string }[] }[]) ?? []
  const acs = phases.find((p) => p.slug === phaseSlug)?.acceptance_criteria ?? []
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
  setChildStatus(node: AnyRec, childSlug: string, status: string): Promise<AnyRec>
  nextChild(node: AnyRec): unknown
  addQuestion(
    node: AnyRec,
    init: { text: string; priority: 'low' | 'medium' | 'high' },
  ): Promise<AnyRec>
  resolveQuestion(
    node: AnyRec,
    id: string,
    r: { answer: string; source: 'user' | 'ai' },
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
  addChildEvidence(node: AnyRec, childSlug: string, acId: string, ev: string[]): Promise<AnyRec>
  setChildFailures(
    node: AnyRec,
    childSlug: string,
    acId: string,
    failures: string[],
  ): Promise<AnyRec>
  setChildAcStatus(node: AnyRec, childSlug: string, acId: string, status: string): Promise<AnyRec>
}

export interface FacadeDeps {
  /** Pick the tier-bound node-ops for a tier. */
  opsFor: (tier: string) => TierOps
  /** Derive a node's tier from its persisted FILE content (tasks[]→epic,
   *  phases[]→task). The File-Shape is the SSOT — no slug-default guessing. */
  tierFor: (slug: string) => Promise<string>
  /** Default status per tier for a freshly created node. */
  defaultStatus: Record<string, string>
}

/** Build the slug-based facade over the injected tier-ops. */
export function createSlugFacade(deps: FacadeDeps): NodeOpsFacade {
  const { opsFor, tierFor, defaultStatus } = deps
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
      }
      if (tier === 'epic') base.tasks = [] // seed epic shape → reads derive 'epic'
      return opsFor(tier).create({ ...base, ...rest } as AnyRec)
    },
    read: async (slug) => opsFor(await tierFor(slug)).read(slug),
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
      } as { slug: string; status: string })
    },
    nextChild: async (slug) => {
      const o = opsFor(await tierFor(slug))
      return o.nextChild(await o.read(slug))
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
    setChildAcStatus: async (slug, phase, acId, status) => {
      const o = opsFor(await tierFor(slug))
      return o.setChildAcStatus(await o.read(slug), phase, acId, status)
    },
  }
}
