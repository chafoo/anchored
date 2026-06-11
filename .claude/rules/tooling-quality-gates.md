# Rule: Tooling + Quality-Gates

> Geltung: `core/` (npm-Paket) und jeder Code-Beitrag. Festgelegt im Scaffold.

## Stack (ENTSCHIEDEN 2026-06-10)

- **Bun all-in** als dev-Toolchain: `bun install`, `bun test`, `bun build`.
- **eslint + typescript-eslint** fürs Linting.
- **prettier** fürs Formatieren (eslint lintet, prettier formatiert — getrennt).
- **tsc** für typecheck (`--noEmit`) + `.d.ts`-Emit.

## Node-Kompatibilität (Publish-Bedingung)

Wir veröffentlichen ein **normales npm-Paket** (kompiliertes JS + Types).
Konsumenten brauchen kein Bun.

- **Code Node-kompatibel halten** — `node:fs` / `node:path` / `node:child_process`,
  **keine `Bun.*`-APIs** im Produktiv-Code. Bun ist nur dev-Beschleuniger +
  Test-/Build-Runner.
- **`bin`-shebang** `#!/usr/bin/env node` fürs publizierte CLI (max. Kompatibilität).
- Publish-Artefakt: zu JS kompiliert, `target: node`. `bun publish` oder `npm publish`.

## Quality-Gates (grün vor `done`)

Vor jeder `ac → done`-/Phase-Abschluss gilt für `core/`:

1. **lint** — eslint sauber
2. **format** — prettier-check sauber
3. **typecheck** — `tsc --noEmit` ohne Fehler
4. **test** — `bun test` grün
5. **build** — `bun build` / kompiliert ohne Fehler

Als npm-Scripts verdrahtet. Ein roter Gate blockiert den Abschluss — das ist
Evidence-Honesty auf Paket-Ebene.

## Referenz

`CLAUDE.md` (Quality-Gates pro Paket), `docs/design/file-structure.md`
(core/package.json). [[fractal-substrate-integrity]] (Gates ≈ Invariante auf
Paket-Ebene).
