// _v3/lib/contracts/tier.ts — what a tier FACTORY returns (cli/modules↔modules). A module
// factory (createPhase/createTask/…) owns its rules + verbs and exposes this surface; the
// cli dispatches `<tier> <verb>` to it, and a parent module may demand a child's `Tier` (by
// this contract) to read across files. Interface-only.

export interface Tier {
  /** the tier name (phase·task·epic). */
  tier: string
  /** run a verb (the api.md grammar's <verb>) with its positional args → result. */
  run(verb: string, args: string[]): Promise<unknown>
  /** the verbs this tier exposes — the cli renders help from the union of these. */
  verbs(): string[]
  /** read a node by slug (the typed `get` — used by a parent module's roll-up). */
  get(slug: string): Promise<unknown>
}
