// contracts/tier.ts — the surface every tier module returns, plus the slug-based
// verb surface its cli drives. Interface-only: imported by modules + cli, imports
// nothing. A tier implements the subset of TierOps its collection needs (epic→child,
// task→phase, phase→ac) — the union here is the maximal public surface.

/** A persisted node, untyped at the boundary (the concrete tier schema validates). */
export type Node = Record<string, unknown>

/** A tier's identity: the fields the store + cli read to route + default a node.
 *  The concrete descriptor additionally carries the zod schema (tier-internal). */
export interface TierDescriptor {
  tier: string
  childTier?: string
  defaultStatus: string
  statusValues: readonly string[]
}

/** The slug-based verbs a tier exposes. The cli passes slugs and gets nodes back;
 *  every mutation routes through the store gateway and asserts the tier invariants. */
export interface TierOps {
  create(slug: string, init: Record<string, unknown>): Promise<Node>
  read(slug: string): Promise<Node>
  setStatus(slug: string, status: string): Promise<Node>
  addChild(
    slug: string,
    child: { slug: string; goal?: string; depends_on?: string[] },
  ): Promise<Node>
  setChildField(slug: string, childSlug: string, field: string, value: unknown): Promise<Node>
  setChildStatus(slug: string, childSlug: string, status: string): Promise<Node>
  nextChild(slug: string): Promise<unknown>
  readyChildren(slug: string): Promise<unknown>
  addQuestion(slug: string, q: { text: string; priority: string }): Promise<Node>
  resolveQuestion(
    slug: string,
    id: string,
    r: { answer: string; source: string; reasoning?: string },
  ): Promise<Node>
  addConcern(slug: string, q: { text: string; priority: string }): Promise<Node>
  resolveConcern(
    slug: string,
    id: string,
    r: { answer: string; source: string; reasoning?: string },
  ): Promise<Node>
  appendLog(slug: string, e: { at: string; kind: string; note: string }): Promise<Node>
  setField(slug: string, field: string, value: string): Promise<Node>
  setExecutor(slug: string, phase: string, value: string): Promise<Node>
  addEvidence(slug: string, acId: string, text: string): Promise<Node>
  addPhase(slug: string, phase: { slug: string; name?: string }): Promise<Node>
  addAc(slug: string, phase: string, ac: { id?: string; text: string }): Promise<Node>
  addAcceptance(slug: string, text: string): Promise<Node>
  setAcceptanceStatus(slug: string, id: string, status: string, evidence?: string[]): Promise<Node>
  addChildEvidence(slug: string, phase: string, acId: string, text: string): Promise<Node>
  setChildFailures(slug: string, phase: string, acId: string, text: string): Promise<Node>
  setChildAcStatus(slug: string, phase: string, acId: string, status: string): Promise<Node>
  clearChildFailures(slug: string, phase: string, acId: string): Promise<Node>
  setPhaseRules(slug: string, phase: string, path: string, why: string): Promise<Node>
  archive(slug: string): Promise<unknown>
  reset(slug: string): Promise<unknown>
}

/** A tier's cli: the 3-level verb dispatch the root cli forwards `<tier>` to. */
export interface TierCli {
  run(verb: string, args: string[]): Promise<unknown>
}

/** What `createEpic/createTask/createPhase(deps)` returns. */
export interface Tier {
  cli: TierCli
  ops: TierOps
}
