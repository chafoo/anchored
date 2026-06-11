// ops/tier-derive.ts — derive a node's tier from its persisted FILE content (the
// SSOT): tasks[]→epic, phases[]→task, a schema_version-less node with ACs→phase,
// else task. A missing file (a fresh create) falls back to task. No slug-default
// guessing. Lives here (not index.ts) because it awaits the io read — index.ts
// stays a pure, await-free wiring factory.
import { parse } from 'yaml'

interface TierIo {
  readFile(path: string): Promise<string>
}

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
