// contracts/store.ts — the store capability: the single gateway to a task-file.
// `for(descriptor)` binds the gateway to a tier (its schema + path rules); `read`
// loads+validates a node, `mutate` does the guarded read-modify-write (codec +
// invariant + atomic write through the Io seam). Interface-only.
import type { Node, TierDescriptor } from './tier.js'

/** A tier-bound gateway: read a node, or mutate it via a pure transform under the
 *  store's atomic write + invariant guard. */
export interface NodeGateway {
  read(slug: string): Promise<Node>
  /** Read → apply transform → render → atomic-write (with CAS). The transform is a
   *  pure `(node) → node`; the store owns the effect + the invariant assertion. */
  mutate(slug: string, transform: (node: Node) => Node): Promise<Node>
}

export interface StorePort {
  for(descriptor: TierDescriptor): NodeGateway
}
