// ops/engine-ops.ts — tier derivation from a node's child collection.
// (The createEngineOps adapter lived here too; it was removed with the headless
// engine-run chain. tierOfNode is pure string logic with zero engine dependency,
// re-exported by index.ts as the cli/facade tier-derivation seam.)

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
