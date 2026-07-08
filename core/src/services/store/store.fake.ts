// services/store/store.fake.ts — a reusable in-memory StorePort double. The run-module spec
// injects this instead of re-rolling a store: it validates with the GIVEN schema (so the
// module's own schema is exercised) but has no fs/lock. `disk` is exposed for assertions.
// Build-excluded like the specs; any spec may import it.
import { anchoredError } from '../../lib/utils/error.js'
import type { StorePort, Node, Schema } from '../../lib/contracts/store.js'

export interface FakeStore extends StorePort {
  disk: Map<string, Node>
}

export function createFakeStore(seed: Record<string, Node> = {}): FakeStore {
  const disk = new Map<string, Node>(Object.entries(seed))
  return {
    disk,
    async read(slug, schema: Schema): Promise<Node> {
      if (!disk.has(slug))
        throw anchoredError('UnknownRun', `no run '${slug}'`, [
          `anchor it first: anchored anchor ${slug}`,
        ])
      return schema.parse(disk.get(slug)) as Node
    },
    async write(slug, node: Node, schema: Schema): Promise<Node> {
      schema.parse(node) // fail-closed, same as the real store
      disk.set(slug, node)
      return node
    },
    async list(): Promise<string[]> {
      return [...disk.keys()].sort()
    },
  }
}
