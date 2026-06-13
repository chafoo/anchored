// domain/tiers/tiers.ts — the folder's main file: tier derivation, united from the
// two former homes (ops/engine-ops.ts + ops/tier-derive.ts). Both derive a node's
// tier; one from an in-memory child collection (sync), the other from the persisted
// FILE content (async, also detects 'phase'). Both export names are preserved
// verbatim — tierOfNode is re-exported by index.ts (public surface), makeTierFor is
// wired into the slug-facade.
import { parse } from 'yaml'

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

interface TierIo {
  readFile(path: string): Promise<string>
}

// Derive a node's tier from its persisted FILE content (the SSOT): tasks[]→epic,
// phases[]→task, a schema_version-less node with ACs→phase, else task. A missing
// file (a fresh create) falls back to task. No slug-default guessing. Lives behind
// the io seam because it awaits the read — index.ts stays a pure, await-free wiring
// factory.
export function makeTierFor(
  io: TierIo,
  pathFor: (slug: string) => string,
): (slug: string) => Promise<string> {
  return async (slug: string): Promise<string> => {
    try {
      const n = parse(await io.readFile(pathFor(slug))) as {
        tasks?: unknown
        phases?: unknown
        schema_version?: unknown
        acceptance_criteria?: unknown
      }
      if (Array.isArray(n.tasks)) return 'epic'
      if (Array.isArray(n.phases)) return 'task'
      if (n.schema_version === undefined && n.acceptance_criteria !== undefined) return 'phase'
      return 'task'
    } catch {
      return 'task'
    }
  }
}
