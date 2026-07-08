// lib/contracts/store.ts — the store capability (run module ↔ store). The ONE substrate
// service: load/persist a run file SAFELY, validated against a schema YOU give it. It knows
// no criteria, no evidence, no gates — the schema is the law. Interface-only.

/** A persisted run, untyped at the boundary (the injected schema validates it). */
export type Node = Record<string, unknown>

/** The minimal schema surface the store needs — `schema.parse(node)` validates + throws. */
export interface Schema {
  parse(input: unknown): unknown
}

export interface StorePort {
  /** fs.readFile → yaml.parse → schema.parse. */
  read(slug: string, schema: Schema): Promise<Node>
  /** schema.parse (fail-closed) → yaml.stringify(+header) → atomic temp+rename under lock + CAS. */
  write(slug: string, node: Node, schema: Schema): Promise<Node>
  /** the slugs of every persisted run (`.claude/anchored/*.yml`). */
  list(): Promise<string[]>
}
