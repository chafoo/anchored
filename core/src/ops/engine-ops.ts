// ops/engine-ops.ts — the engine's OpsLike, built over the per-tier node-ops.
// Every mutation RE-READS the persisted node first (cli-only-transport model:
// workers self-write evidence to the file; the engine re-reads the latest state
// before its own write so it never clobbers a worker's evidence). A node without
// its own file (a leaf phase) falls back to the in-memory node. This is the only
// await-bearing wiring glue — it lives here so index.ts stays a pure factory.
import type { AnyNode, OpsLike } from '../engine/step-runner.js'
import type { TierOps } from './facade.js'

interface AnyRec {
  slug: string
  status: string
  [k: string]: unknown
}

/** Derive a node's tier from its child collection (epic→tasks, task→phases). */
export function tierOfNode(node: unknown): string {
  const n = node as AnyRec
  if (Array.isArray(n.tasks)) return 'epic'
  if (Array.isArray(n.phases)) return 'task'
  return 'task'
}

export function createEngineOps(opsByTier: Record<string, TierOps>): OpsLike {
  const pick = (node: AnyNode): TierOps => opsByTier[tierOfNode(node)] ?? opsByTier.task!
  const asNode = (p: Promise<AnyRec>): Promise<AnyNode> => p as unknown as Promise<AnyNode>
  const freshen = async (n: AnyNode): Promise<AnyRec> => {
    try {
      return await pick(n).read(n.slug)
    } catch {
      return n as AnyRec // no own file (leaf) → use the in-memory node
    }
  }
  return {
    setStatus: async (n, to) => asNode(pick(n).setStatus(await freshen(n), to)),
    nextChild: (n) => pick(n).nextChild(n as AnyRec) as { slug: string; status: string } | null,
    setChildStatus: async (n, slug, status) =>
      asNode(pick(n).setChildStatus(await freshen(n), slug, status)),
    addQuestion: async (n, init) => asNode(pick(n).addQuestion(await freshen(n), init)),
    resolveQuestion: async (n, id, r) => asNode(pick(n).resolveQuestion(await freshen(n), id, r)),
    appendLog: async (n, e) => asNode(pick(n).appendLog(await freshen(n), e)),
    setField: async (n, field, value) => asNode(pick(n).setField(await freshen(n), field, value)),
  }
}
