# Rule: Test-File Naming — three suffixes, one per test kind

> Scope: every test file under `core/src/`. Decided 2026-06-13. Extends
> [[colocation-and-naming]] (where the test file lives) with the orthogonal
> question "what does the suffix say about the test kind". One concern per rule —
> placement lives in [[colocation-and-naming]], the kind-suffix lives here.

## The rule

**A test file's suffix names its kind. Three suffixes, no others:**

```
foo.spec.ts   # unit        — the single subject module, in isolation
foo.int.ts    # integration — multiple modules wired together, in-memory
foo.e2e.ts    # end-to-end   — real filesystem and/or real process spawn
```

- `*.spec.ts` is the **unit** suffix and keeps the `.spec` anchor.
- `*.int.ts` and `*.e2e.ts` are **bare** — they carry **no `.spec` infix**.
  It is `foo.e2e.ts`, never `foo.e2e.spec.ts`; `foo.int.ts`, never
  `foo.int.spec.ts`. The kind suffix replaces `.spec`, it does not stack on it.

### Classification criteria (apply these per file)

The kind is decided by **what the test touches**, not by what it is named after:

- **unit (`*.spec.ts`)** — exercises a **single subject module in isolation**.
  Every effect dependency (`spawn`, `ops`, `io`, fs) is **mocked/faked** via the
  injected seam ([[factory-functions]]). No second production module runs for
  real, no real filesystem, no real process.
- **integration (`*.int.ts`)** — wires **multiple production modules together**
  but stays **in-memory**: **no real fs, no real `spawn`**. The seams are real
  modules talking to each other; the outermost effects are still faked. Tests the
  contract *between* modules.
- **end-to-end (`*.e2e.ts`)** — touches the **real filesystem and/or a real
  process spawn** and drives a **full lifecycle** through the real boundary. This
  is the only kind allowed to hit real I/O.

The discriminator is a strict ladder: real fs/spawn → `e2e`; else multiple real
modules wired → `int`; else single module, all deps faked → `spec`.

## Always

- **Pick the suffix by the criteria above** — classify by what the test actually
  touches (faked-everything → `spec`, multi-module in-memory → `int`, real
  fs/spawn → `e2e`), not by the file's subject or folder.
- **Keep the test next to its subject** — colocation from
  [[colocation-and-naming]] holds for **all three** suffixes: `foo.spec.ts`,
  `foo.int.ts`, `foo.e2e.ts` each live in the **same folder as `foo.ts`**, their
  subject. The kind-suffix does not change *where* the file lives.
- **Cross-cutting suites sit next to their nearest entry-point module** — an
  `*.e2e.ts` that drives the whole lifecycle has no single subject module; place
  it next to the entry-point it exercises (e.g. the `cli/` or `orchestration/` factory it
  drives), not in a separate test tree.
- **Keep all three suffixes in the runner glob** — `core/bunfig.toml` `[test]`
  must match `*.spec.ts`, `*.int.ts`, `*.e2e.ts` (see Why; this config is
  load-bearing).
- **Keep all three suffixes out of the build artifact** —
  `core/tsconfig.build.json` `exclude` must cover `*.spec.ts`, `*.int.ts`,
  `*.e2e.ts` so no test ships in `dist/`.

## Never

- **No `.spec` infix on `int`/`e2e`** — `foo.e2e.spec.ts` and `foo.int.spec.ts`
  are forbidden. The kind suffix is terminal: `foo.e2e.ts`, `foo.int.ts`.
- **No fourth suffix, no `*.test.ts`** — the three kinds above are exhaustive.
  `*.test.ts` (bun's other default) is not used in this repo.
- **No separate test directory tree** — there is no `src/e2e/` (it is dissolved in
  this very convention); a test never lives apart from its subject just because of
  its kind.
- **No real fs/spawn in a `*.spec.ts` or `*.int.ts`** — if a test reaches for the
  real filesystem or a real process, it is an `e2e` by definition and must be
  renamed.

## Why

**Discovery is load-bearing.** Bun's default test matcher only finds
`*.spec.ts` / `*.test.ts`. Because `*.int.ts` and `*.e2e.ts` deliberately drop
the `.spec` anchor, bun **will not discover them** without help. Therefore a
`core/bunfig.toml` with an explicit `[test]` glob covering all three suffixes is
**required** — it is not cosmetic, it is what makes `int`/`e2e` tests run at all.
Symmetrically, the build excludes (`core/tsconfig.build.json`) must list all three
so the bare suffixes never leak into the published artifact.

The suffix-as-kind lets a reader (and a CI filter) tell unit from integration from
end-to-end at a glance, and lets the test runner select by speed/cost class — fast
faked units vs. slow real-I/O e2e — purely from the filename.

## Reference

`docs/design/file-structure.md` (the structure map), `core/bunfig.toml` (the
discovery glob), `core/tsconfig.build.json` (the build excludes).
[[colocation-and-naming]] (spec-next-to-subject placement — orthogonal to this
kind-suffix), [[factory-functions]] (the faked-seam that defines a unit),
[[tooling-quality-gates]] (bun as the test runner).
