---
name: setup
description: "Configure and extend the project's anchored.yml — the named setups (frontend/backend/docs/release …) with their validator instructions, the before/after instruction hooks, and the top-level custom criterion fields. USE THIS whenever the user wants to create, change, extend, or tidy their anchored.yml in ANY way — adding a setup, wiring a linter before validation, committing on green, opening a PR on close, declaring a commit-sha field — even when they don't say \"anchored.yml\" or \"setup\" (e.g. \"make anchored run my linter before validating\", \"have it open a PR when the run closes\"). Also the ONBOARDING entry: when /a:run finds no anchored.yml, this is where the user optionally sets one up. Translates stated wishes into schema-valid config, advises on request — never pushes a setup the user didn't ask for."
---

# /a:setup — author the project's anchored.yml

anchored.yml is deliberately tiny. Everything you may write, exhaustively:

```yaml
fields:                 # top-level, for ALL setups — record form name: type
  commit: string        #   string | number | boolean
defaults:               # the setup shape, used when a criterion has no setup
  validator: { instructions: "…", require: grounded }   # `require` optional, see below
  before:    { instructions: "…" }
  after:     { instructions: "…" }
setups:
  frontend:             # user-named; EXACTLY the same three slots as defaults
    validator: { instructions: "…" }
    before:    { instructions: "…" }
    after:     { instructions: "…" }
```

Full commented example: [references/anchored.example.yml](../../references/anchored.example.yml).

## The guardrails (you enforce these while authoring)

- **A setup is verification know-how for one kind of work** — the domain axis. It attaches
  per criterion at run time. It is parametrisation of the ONE loop, never a step sequence:
  no `steps`, no `extends`, no nesting. The schema rejects them; don't try.
- **Hooks are instructions the agent executes**, not harness-run command lists — that's
  what lets them wrap context around a CLI call ("run `bun run typecheck`; treat red as a
  failed gate"). Write them as instruction prose containing the concrete commands.
  `before` runs ahead of each validator spawn for that setup's gates; `after` on a setup
  fires when one of its gates goes green; `after` on `defaults` is the close-time hook.
- **`validator.require: grounded` is the one HARD knob** — the only place config stops
  being advice. It makes a setup refuse a prose verdict: proof must carry the real output
  of something the validator ran (`UngroundedEvidence` otherwise). Offer it where the
  subject is genuinely executable and the stakes are high (a `release` setup); never make
  it the default, and never put it on a setup that verifies assets, copy or design — those
  are proven by inspection, and that is proof too. Criteria marked `judgment: true` stay
  exempt everywhere. It merges DOWN: set on `defaults`, a named setup keeps it even when it
  writes its own `instructions`.
- **NOT config, by design** — refuse politely and say where it lives instead:
  - `rigor` / quality bar → per task, in the run file, from the user's words at anchor time
  - gate layout → the AI slices gates itself, sized to the rigor
  - architecture/conventions → `.claude/rules/` (every validator reads them anyway)
  - git/CI built-ins → don't exist; wire them via hook instructions + `fields`
- **Custom fields are top-level** and shared by all setups; a hook fills them via
  `anchored set <slug> <cN> <field>=<value>`.

## Onboarding (no anchored.yml yet)

Inspect the project first — package.json scripts, CI config, folder layout,
`.claude/rules/` — then propose 2–3 setups that match how this project actually builds
and tests, with real commands in the hook instructions (the project's own `lint`/`test`
scripts, not generic ones). Two setups beat five: only name work shapes the project
visibly has. Let the user pick; write only what they confirm.

**Git detected?** Offer (once, take no for an answer) the sharp snapshot wiring: a
`before` instruction that commits the gate's state and passes
`--snapshot $(git rev-parse --short HEAD)`, plus a `commit: string` field filled by the
`after` hook. Without it, validation still works — the validator just runs the simpler
outcome check against the working tree. Git stays the user's policy, never anchored's
mechanism.

## Editing an existing anchored.yml

Read it, touch ONLY what the request implies, preserve everything else (comments
included). Map the wish to the right slot: "before validating…" → that setup's `before` ·
"when the gate/run is green…" → setup/defaults `after` · "the validator should also…" →
`validator.instructions` · "store/track X per criterion" → `fields` + the hook that fills
it. A wish that spans all setups belongs in `defaults`.

## Verify before you finish

The config only loads if it is schema-valid, so prove it:

```bash
anchored status   # exit 0 = anchored.yml parsed; an InvalidConfig envelope names the problem
```

Then show the user the changed region and one sentence on what will now happen at run
time. Never leave the file invalid.
