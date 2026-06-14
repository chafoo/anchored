# Rule: Colocation + File-Naming — no barrels, no bare `index.ts`

> Scope: the entire `core/src/`. Structural convention for every new + existing
> piece of code. Decided 2026-06-13. Extends [[factory-functions]] (one factory per module)
> with the question "where does the file live".

## Colocation — files that belong together go in one folder

**As soon as a module gains accompanying files (spec, scope helpers, types, fixtures),
it moves into its own folder.** A `foo.ts` with a `foo.spec.ts` next to it is
no longer a flat pair — it becomes:

```
foo/
├── foo.ts          # the factory (named after the folder)
└── foo.spec.ts     # the spec right next to it
```

Goal: clarity. Whoever opens the folder sees everything that belongs to one unit —
implementation, test, local helpers — in one place, instead of scattered across a flat
directory.

- **Spec always next to its subject** — `foo.spec.ts` lives in the same folder as
  `foo.ts`. No specs that have their subject in a different directory. This rule
  governs *where* a test lives; *which* kind-suffix it carries
  (`*.spec.ts`/`*.int.ts`/`*.e2e.ts`) is the orthogonal concern of
  [[test-file-naming]].
- **Local helpers in `scope/`** — a factory's deeper helpers continue to live in
  their `scope/` subfolder (existing convention, see `services/store/codec/`,
  `services/config/resolve-steps/`). `scope/` files follow the same naming + colocate their own
  specs.
- **A single file without companions** needs no folder — only once a second
  related file appears is the folder created.

## Naming — the folder file is named after the folder

**Instead of `index.ts`, the main file of a folder is always named after the folder:**
`foo/foo.ts`, `cli/cli.ts`, `node-store/node-store.ts`, `io/io.ts`. No `index.ts` as the
entry point of a subfolder.

- Import paths thereby become explicit + greppable: `from './io/io.js'`, not
  `from './io/index.js'`. You can tell from the path which module is meant.
- **Only permitted exception:** the npm package entry at the package root
  (`core/src/index.ts`, wired as `package.json` `main`/`exports`). It stays
  `index.ts`, because it is the public package interface — not a
  folder-internal module.

## No barrel files / barrel imports

**No re-export-only file** whose sole purpose is to bundle and pass through symbols
from sibling modules (`export * from './a'`).

- **Import directly from the source module** — `from './services/store/node-store/node-store.js'`,
  not from an aggregating `store.ts` that re-exports everything.
- A factory file that contains real wiring logic (e.g. `cli/anchored.ts` builds
  `createAnchored`) is **not** a barrel — it does work, it doesn't just pass through.
  Forbidden is only the pure aggregation/pass-through file.
- **Exception: the package entry** (`core/src/index.ts`) MAY be a pure re-export —
  it is the deliberate public-interface boundary of the npm package, re-exporting the
  orchestrator's surface (`createAnchored`, types) from `cli/`. This is permitted
  precisely because it is the package's one published seam, not an internal
  aggregation file hiding the dependency graph between sibling modules.

## Why

Clarity (everything for one unit in one place), greppable import paths
(`io/io.ts` instead of 12× `index.ts`), no hidden aggregation indirection. Barrels
obscure the real dependency graph and break tree-shaking + targeted
fake-ability of individual seams ([[factory-functions]]).

## Reference

`docs/design/file-structure.md` (the structure map — in line with this
convention; the single `index.ts` there is the package-root entry).
[[factory-functions]], [[fractal-substrate-integrity]], [[test-file-naming]]
(the orthogonal kind-suffix rule — placement here, test-kind there).
