// _v3/lib/contracts/store.ts — the store capability (modules↔store). The ONE substrate
// service: load/persist a node SAFELY, validated against a schema YOU give it. It knows no
// tier, no evidence, no transition — the schema is the law. Interface-only.

/** A persisted node, untyped at the boundary (the injected schema validates it). */
export type Node = Record<string, unknown>

/** The minimal schema surface the store needs — `schema.parse(node)` validates + throws. */
export interface Schema {
  parse(input: unknown): unknown
}

export interface StorePort {
  /** fs.readFile → yaml.parse → schema.parse. */
  read(slug: string, schema: Schema): Promise<Node>
  /** schema.parse → yaml.stringify(+header) → atomic temp+rename under lock + CAS. */
  write(slug: string, node: Node, schema: Schema): Promise<Node>
  /** move the file as a unit into archive/<slug>.yml (the `move` op — no content change). */
  archive(slug: string): Promise<void>
  /** delete the file as a unit (reset — back to before the node existed). */
  remove(slug: string): Promise<void>
}
