# @chaafoo/anchored

> The verification gate for AI work. Nothing reaches `done` without validator-authored
> evidence, grounded in an executed command.

This package is the **`anchored` CLI and core** — the run-file schema, the evidence
invariant, the atomic store, and the nine flat verbs. It is what enforces the guarantee;
it does not orchestrate anything and it never calls an AI.

Most people don't install this directly. It ships inside the
[anchored plugin for Claude Code](https://github.com/chafoo/anchored), which puts the
binary on PATH and adds the `/a:run` and `/a:setup` skills plus the validator agent.

## Install

```bash
npm install -g @chaafoo/anchored
```

## The nine verbs

```
anchored anchor <slug>              # freeze a plan + its criteria into .claude/anchored/<slug>.yml
anchored claim <slug> <text>        # append a work note to the trail
anchored amend <slug>               # the only way criteria change (supersede / reject / add)
anchored validate <slug> --gate <g> # the validation packet for ONE validator spawn
anchored evidence <slug> <cN> …     # VALIDATOR-ONLY: flip to done with grounded proof
anchored fail <slug> <cN> …         # VALIDATOR-ONLY: reject with a reasoned verdict
anchored set <slug> <cN> <f> <v>    # write a declared custom field
anchored status [slug]              # the run, or summaries of every run
anchored close <slug>               # refused while any active criterion is unproven
```

Every call prints one JSON envelope: `{ ok, command, result | error }`.

## The invariant

A criterion reaches `done` only with `evidence: {by: validator, snapshot, grounded, at}`,
parsed fail-closed on every write. `grounded` is executed-command output. A prose
`verdict` proves a criterion **only** where its author declared `judgment: true` up front —
the one opt-out, visible in the run file. `failed` requires a reasoned verdict, `close`
stays shut until every active criterion is done, and criteria are never deleted.

The engine is deterministic; the validator is an effect the _skill_ triggers. The CLI
never spawns an agent.

## Docs

Full documentation, the run-file format and the plugin live at
**https://github.com/chafoo/anchored**.

MIT © anchored contributors
