// contracts/tier.ts — the surface every tier module returns, plus the slug-based
// verb surface its cli drives. Interface-only: imported by modules + cli, imports
// nothing. A tier implements the subset of TierOps its collection needs (epic→child,
// task→phase, phase→ac) — the union here is the maximal public surface.

/** A persisted node, untyped at the boundary (the concrete tier schema validates). */
export type Node = Record<string, unknown>

/** A tier's CONDITION bundle — the pure knowledge unit a `modules/<tier>` exports
 *  and the orchestrator injects into the generic store (`createNodeOps(conditions,
 *  deps)`). It is everything tier-specific the mechanism needs to operate a node of
 *  this tier WITHOUT knowing which tier it is: the schema, the own status axis +
 *  forward edges, the default status, and the child relationship (where children
 *  live, which status/terminal/executor axes they use). A module imports only lib
 *  to build this; it carries no I/O and no behaviour beyond pure validation. */
export interface TierCondition {
  tier: string
  /** the tier's zod schema (parse() validates a whole node on the write path). */
  schema: { parse(input: unknown): unknown }
  /** the tier's own status axis. */
  statusValues: readonly string[]
  /** forward-only edges keyed by from-status (X→X is idempotent). */
  transitions: Record<string, readonly string[]>
  /** status a freshly-created node of this tier seeds with. */
  defaultStatus: string
  /** the child tier (undefined for the leaf). */
  childTier?: string
  /** the node field children live under (epic→'tasks', task→'phases'). */
  childField?: string
  /** valid status values for a child (a phase's real axis, or the stub marker). */
  childStatusValues?: readonly string[]
  /** child statuses that count as terminal so the parent may complete. */
  childTerminalOk?: readonly string[]
  /** valid executor values for a child phase (task only; undefined elsewhere). */
  childExecutorValues?: readonly string[]
}

/** Back-compat alias — the routing subset the cli reads. A {@link TierCondition}
 *  satisfies it structurally. */
export type TierDescriptor = TierCondition

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
