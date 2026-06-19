# Stack: Bun + TypeScript, framework-free DOM

This project runs on **Bun** with **TypeScript** source. Bun is the runtime,
the test runner (`bun test`), and the bundler/dev-server — there is no separate
`tsc`/webpack/vite step and no Node toolchain.

## Allowed

- **TypeScript** (`.ts`) everywhere — typed source, ES modules (`import` /
  `export`). Bun executes `.ts` directly; no compile step to run tests.
- **Bun** as runtime, test runner, and dev-server. `index.html` references the
  `.ts` entry directly and Bun transpiles it on the fly when serving
  (`bun ./index.html`). A release build, if ever needed, is `bun build`.
- Browser-native **HTML and CSS**. CSS uses custom properties (design tokens).

## NOT allowed

- **No UI framework** — React, Vue, Svelte, Lit, or any component framework.
  The DOM is hand-built (see the DOM concern rule). This keeps the app small
  and the code 1:1 with what runs in the browser.
- **No extra build tooling** beyond Bun — no webpack/vite/parcel/rollup, no
  standalone `tsc` pipeline. Bun is the whole toolchain.
- **No runtime dependencies for things the platform already does** — prefer
  browser/Bun built-ins (`FileReader`, `canvas`, `localStorage`, `fetch`).
  Adding an npm dependency needs a real justification, not convenience.

## Modules + tests

- Logic lives in its own `.ts` module with `export`ed functions; UI wiring
  (`app.ts`) is the browser-only orchestrator and the single place feature
  modules are wired together (no feature module imports another feature
  module — pass callbacks in).
- Tests are `<module>.test.ts` using Bun's built-in test API
  (`import { test, expect } from "bun:test"`) and run with `bun test` — zero
  external test dependencies.

**Why:** Bun + TypeScript gives type safety with a modern, zero-config toolchain,
while keeping the app framework-free and hand-crafted.

**Applies to:** all `.ts`, `.html`, `.css` files in the project.
