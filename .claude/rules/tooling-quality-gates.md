# Rule: Tooling + Quality-Gates

> Scope: `core/` (npm package) and every code contribution. Fixed in the scaffold.

## Stack (DECIDED 2026-06-10)

- **Bun all-in** as the dev toolchain: `bun install`, `bun test`, `bun build`.
- **eslint + typescript-eslint** for linting.
- **prettier** for formatting (eslint lints, prettier formats — separated).
- **tsc** for typecheck (`--noEmit`) + `.d.ts` emit.

## Node compatibility (publish condition)

We publish a **normal npm package** (compiled JS + types).
Consumers do not need Bun.

- **Keep the code Node-compatible** — `node:fs` / `node:path` / `node:child_process`,
  **no `Bun.*` APIs** in production code. Bun is only a dev accelerator +
  test/build runner.
- **`bin` shebang** `#!/usr/bin/env node` for the published CLI (maximum compatibility).
- Publish artifact: compiled to JS, `target: node`. `bun publish` or `npm publish`.

## Quality-Gates (green before `done`)

Before every `ac → done` / phase completion, the following holds for `core/`:

1. **lint** — eslint clean
2. **format** — prettier check clean
3. **typecheck** — `tsc --noEmit` without errors
4. **spec-coverage** — `npm run coverage:specs` (scripts/spec-coverage.sh) clean:
   every runtime file under `lib/` · `modules/` · `services/` carries a colocated
   test (`*.spec.ts`/`*.int.ts`/`*.e2e.ts`, basename-prefixed so an aspect spec
   counts). A source file with no colocated test blocks the gate. Runs as the first
   step of `npm test`. (Enforces the 100%-coverage rule structurally — see
   `docs/design/north-star.md.)
5. **test** — `bun test` green
6. **build** — `bun build` / compiles without errors

Wired up as npm scripts. A red gate blocks completion — that is
evidence-honesty at the package level.

## Reference

`docs/design/north-star.md` (core/package.json).
[[substrate-integrity]] (gates ≈ invariant at the package level).
