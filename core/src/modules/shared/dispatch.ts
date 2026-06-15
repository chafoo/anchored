// _v3/modules/shared/dispatch.ts — the shared tier dispatcher (pure wiring). Every tier factory
// declares two maps — `nodeVerbs` (the node-level + lifecycle verbs) and `collections`
// (`<collection> → { <op> → fn }`) — and hands them here. `dispatch` builds the `Tier` and
// implements the api.md two-token grammar:
//
//   <tier> <verb> <slug> [args]            → nodeVerbs[verb](slug, …args)         (node / lifecycle)
//   <tier> <collection> <op> <slug> [args] → collections[collection][op](slug, …) (sub-resource)
//
// So `run('ac', ['add', slug, text])` routes to `collections.ac.add(slug, text)`, while
// `run('status', [slug, to])` routes to `nodeVerbs.status(slug, to)`. The reused vocabulary
// (add/list/get/set/remove + domain ops) lives in the collection maps — one verb name per op,
// no hyphenated specials. `verbs()` lists the whole surface (node verbs + `collection op`).
import { anchoredError } from '../../lib/utils/error.js'
import type { Tier } from '../../lib/contracts/tier.js'

export type Verb = (...args: string[]) => Promise<unknown>
export type NodeVerbs = Record<string, Verb>
export type Collections = Record<string, Record<string, Verb>>

export function dispatch(
  tier: string,
  nodeVerbs: NodeVerbs,
  collections: Collections,
  get: (slug: string) => Promise<unknown>,
): Tier {
  // the flat list of every callable command — node verbs as one token, collection ops as two.
  const surface = (): string[] => [
    ...Object.keys(nodeVerbs),
    ...Object.entries(collections).flatMap(([c, ops]) =>
      Object.keys(ops).map((op) => `${c} ${op}`),
    ),
  ]

  return {
    tier,
    verbs: surface,
    get: (slug) => get(slug),
    run: async (verb, args) => {
      // collection grammar: `<collection> <op> …` — the verb names a collection, args[0] is the op.
      const col = collections[verb]
      if (col) {
        const [op, ...rest] = args
        if (op === undefined) {
          throw anchoredError('NoOp', `'${tier} ${verb}' needs an op`, [
            `ops: ${Object.keys(col).join(', ')}`,
          ])
        }
        const fn = col[op]
        if (!fn) {
          throw anchoredError('UnknownOp', `'${tier} ${verb}' has no op '${op}'`, [
            `ops: ${Object.keys(col).join(', ')}`,
          ])
        }
        return fn(...rest)
      }
      // node / lifecycle grammar: `<verb> <slug> …`.
      const fn = nodeVerbs[verb]
      if (!fn) {
        throw anchoredError('UnknownVerb', `${tier} has no verb '${verb}'`, [
          `known: ${surface().join(', ')}`,
        ])
      }
      return fn(...args)
    },
  }
}
