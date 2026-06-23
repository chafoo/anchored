# @chaafoo/anchored

> The factory engine + CLI behind [anchored](https://github.com/chafoo/anchored) —
> the Claude Code plugin for long autonomous AI coding runs.

The deterministic core of anchored: a pure factory-function engine over a
schema-validated data model, driven entirely through the **`anchored` CLI** (no MCP).
It owns the fractal lifecycle (plan → refine → build → wrap on epic ▸ task ▸ phase),
the state machine, atomic node-file writes, and the one hard invariant — **no
acceptance criterion reaches `done` without evidence.**

Most users never install this directly — the plugin bundles the CLI and ships it on
PATH. This README covers the engine itself (internals, standalone CLI use, scripting
inside `anchored.yml` steps).

## Getting the CLI

There's nothing to install for plugin users — the plugin bundles the CLI and ships
it on PATH (see above). For standalone or dev use, build it from source: clone the
repo, then in `core/` run `bun install && bun run build` and invoke the result with
`node dist/bin.js` (or put it on your PATH). See [Develop](#develop) below.

Requirements: Node 20+. When built, the artifact is plain Node (compiled JS + types);
Bun is the dev toolchain only — consumers don't need it.

## The CLI

One two-token grammar covers every tier uniformly — the tier (`phase` · `task` ·
`epic`) is always the first token, and nesting lives in the slug:

```bash
anchored <tier> <verb> [slug] [args]
```

```bash
# lifecycle verbs return the orchestration step-plan — they mutate nothing
anchored task plan my-task
anchored epic build my-epic

# node + collection verbs mutate, each through the validating, atomic-writing store
anchored phase ac add my-task/setup "the handler is validated"          # → a1, pending
anchored phase ac evidence my-task/setup a1 "src/h.ts:42 — bun test green"
anchored phase status my-task/setup done        # refused unless every AC is terminal
```

Collections route as `<tier> <collection> <op>` (`ac` · `question` · `child` …).
Every call prints one envelope; with `--json` the full structured object, otherwise
a dense readable line with a precomputed `next:` hint. Meaningful exit codes
(`0` ok · `2` usage · `3` not-found · `4` schema/invariant), and `-` reads one
body value from stdin. Run `anchored help` for the full surface, or see
[`../plugin/references/api.md`](../plugin/references/api.md).

## The factory engine

`createX(cfg, deps) → { verb(args) → result }`, from the contract up:

```
src/lib/        the contracts + the error primitive
src/modules/    shared schema fragments + the tier factories (phase · task · epic)
src/services/   the dumb store (fs · lock · yaml seams) + the template service
src/cli/        createCli — the one assembly point + the two-token dispatch
```

**Mechanism is code** (the store, the per-tier guards, the transitions, the
invariant); **policy is config** (the step sequences + the fields live in
`default-template/anchored.default.yml`, overridable by the user's `anchored.yml`).
The engine knows no concrete step names — there are **no built-ins**. AI is an
effect behind the injected `spawn` seam, never called from the control flow
directly.

## The one invariant — secured in the schema

An `ac` only reaches `status: done` when `evidence` is present. It is a Zod
`.refine` on the shared acceptance-criterion fragment, run on **every** store
write — unskippable, defined once, reused by every tier schema. The dumb store never
even knows what evidence _is_; it just runs `schema.parse`. We secure the proof,
never the work.

## Guarantees

Every mutation goes through the store, which:

- **Validates** against the tier schema (Zod) on every write
- **Atomic write** via temp + rename — never a partial file on disk
- **Cross-process safe** via file-lock + compare-and-swap
- **State-machine enforced** — illegal stage transitions throw typed errors
- **Round-trips** user extensions (custom fields, custom sections) untouched

No agent can "forget" evidence, no malformed node slips through, no silent
corruption.

## Develop

```bash
bun install
bun run test          # spec-coverage gate + unit + e2e + int
bun run lint && bun run typecheck
bun run build         # tsc → dist/ (Node-compatible)
```

Every runtime file under `lib/` · `modules/` · `services/` carries a colocated test
(`*.spec.ts` / `*.int.ts` / `*.e2e.ts`); the spec-coverage gate is the first thing
`bun run test` checks. The factory pattern is non-negotiable — see
[`../.claude/rules/`](../.claude/rules).

## License

MIT — see [LICENSE](../LICENSE).
