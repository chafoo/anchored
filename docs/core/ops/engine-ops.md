← [ops](_ops.md)

# engine-ops

Tier derivation from a node's child collection — a single pure helper. The file
once also held `createEngineOps` (the freshen-before-write adapter the headless
engine used); that adapter was removed with the engine-run chain. What remains is
zero-dependency string logic, re-exported by [index.ts](../wiring.md) as the
tier-derivation seam the CLI / facade share.

## What

- **`tierOfNode(node)`** derives the tier from the child collection: `tasks[]` →
  epic, `phases[]` → task, otherwise task.
- No engine dependency, no await, no effect — pure inspection of the node shape.

## Why

The tier of a node is not stored, it is implied by which children it carries. A
single derivation rule keeps the CLI and the [facade](facade.md) agreeing on
which [node-ops](node-ops.md) surface to pick, without persisting a redundant
`tier` field.
