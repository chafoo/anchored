← [docs](_docs.md)

# Setup

Setup is the onboarding + configuration skill. It authors the project's
`anchored.yml`: the defaults and the **named setups** (`frontend`, `backend`,
`release`, …) that answer *how to verify a kind of work* — the domain axis.
Setups attach per **criterion** (a run spanning db → api → ui verifies each
layer with its own setup). How *strict* a run is (`rigor`) is not configured
here at all — it is a per-task property of the run file. Setup is the only
place configuration happens; the run skill itself has no knobs.

## What you can do

- **Onboard in a minute** — the skill inspects the project (package.json, CI
  config, folder layout, `.claude/rules/`), proposes 2–3 setups that match how
  the project actually builds and tests, and writes them.
- **Name your work shapes** — you decide the vocabulary: `frontend`,
  `backend`, `ci`, `docs`, `release`. Later, "simple frontend task" is all the
  routing a run needs — and a cross-layer task simply tags each criterion
  with the setup that knows how to verify it.
- **Wire your flow into the two hooks** — "run my linter first", "commit on
  green", "open a PR when done" become `before` / `after` **instructions** on
  a setup. Instructions, not bare commands: the agent executes them, so they
  can wrap context around a CLI call.
- **Add your own criterion fields** — declare top-level `fields` in record
  form `name: type` (e.g. `commit: string`), available to every setup, filled
  by hooks (`anchored set … commit=<sha>`). anchored ships no git/CI
  built-ins — you assemble your own enrichment around the one validate loop.
- **Configure the how, never the how-much** — a setup describes verification
  know-how for a domain (browser checks, real test runs, link checks). The
  quality bar (`rigor`) and the gate layout are per-run decisions the AI makes
  in the run file; neither is configurable here.
- **Share the process** — `anchored.yml` is committed; the team's gates,
  hooks, and validator expectations are versioned and identical for everyone.

## How to run it

```
/a:setup <what you want in your own words>
```

Examples: "add a docs setup that only checks links and tone", "make the
backend setup commit after every green gate", "we need a release setup that
validates every criterion individually".

## Guardrails (the skill enforces these while authoring)

- A setup has **exactly the fields of the top-level config** — no `extends`,
  no nesting; resolution is a flat merge of `defaults` + the chosen setup.
- A setup is **parametrisation of the one loop, never a step sequence**. The
  only sequence points are `before` and `after`, and they hold instruction
  blocks — no step lists, no workflow.
- Architecture and conventions do **not** go here — they belong in
  `.claude/rules/`, which every validator reads anyway.

## Configure it

The full commented schema: [`examples/anchored.yml`](examples/anchored.yml).

| Field | On | Effect |
| --- | --- | --- |
| `validator.instructions` | defaults / setup | Extra prose appended to the validator's contract (e.g. "evidence must be a real test run"). |
| `before.instructions` | defaults / setup | Agent-executed instructions before a validator spawns for one of this setup's gates (e.g. "run `bun run typecheck`, red = failed gate"). |
| `after.instructions` | defaults / setup | On a setup: what to do when one of its gates goes green (e.g. commit + `anchored set`). On `defaults`: the close-time instructions (push, PR). |
| `fields` | top level | Additive custom criterion fields, record form `name: type` (`string`/`number`/`boolean`) — e.g. `commit: string`. For all setups; filled via `anchored set`. |

Not here by design: `rigor` (per task, in the run file), any gate layout
(sized by the run skill), and any git/CI built-ins (anchored ships only the
validate loop — you wire the rest).
