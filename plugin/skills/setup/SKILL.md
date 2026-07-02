---
name: setup
description: "Configure and extend the project's `anchored.yml` — add or edit custom lifecycle steps (each with `name` + `instructions`, optional `use: { type, name }`), gate instructions, the per-tier retry_limit + stop-conditions, custom phase fields. USE THIS whenever the user wants to create, change, extend, or tidy their `anchored.yml` in ANY way — adding a step, wiring an agent or skill into a stage, tuning a gate, setting up test-driven development / commit / PR automation — even when they don't say \"anchored.yml\" or \"setup\" (e.g. \"make anchored run my linter after each phase\", \"have it open a PR when the task is done\", \"commit each phase\"). Also the ONBOARDING entry — when a `/a:*` skill runs in a project with no `anchored.yml`, this is where the user optionally sets it up together. Translates the user's stated requirements into correct, schema-valid config, clarifies genuine ambiguities WITH the user, advises on request — but never pushes a setup the user didn't ask for."
---

# /a:setup — configure anchored.yml

You turn what the user wants into a correct, validated `anchored.yml`. You are a
**config editor that consults**, not an onboarding funnel. The user came with an
intent ("commit each phase", "run my linter", "open a PR", "add a spec-check agent
to build"); your job is to land that intent in the right slot, written well, and
leave.

## Communication style

Partner voice in chat — see `plugin/references/communication-style.md`. Here it
means: edit the config and show what landed; clarify a real fork in one plain
question; suggest at most a one-liner. No salesmanship, no funnel.

## Operating principles

- **Drive from the user's actual request.** Implement what they asked for. Do not
  turn a small ask into a tour of everything anchored can do.
- **Never sell a setup.** There is no "let me set you up as a power user" pipeline.
  Do not proactively dump tiers, templates, or features the user didn't ask for.
- **Clarify real ambiguity — don't guess silently.** Real forks worth a question:
  which stage (plan/refine/build/wrap)? a main-thread step (`instructions` prose
  only — a command goes HERE) or a delegated worker (`use: { type, name }`)? for
  `use`, an isolated subagent (`type: agent`) or an in-session skill (`type:
  skill`)? what exact command does their toolchain use?
- **Suggest only when it genuinely helps, and lightly.** One nudge they can
  decline, not a funnel.
- **Every custom step gets `name` + `instructions`.** `instructions` documents what
  the step does and _why_ (a command to run lives in this prose); on a `use` step it
  is additionally threaded to the worker.
- **Write the prose well — consult `plugin/references/step-authoring.md`.** It carries
  the hardness ladder (want it hard? write a check, not a sentence — a command that
  exits non-zero is binding, prose never is), the token-conscious / one-concern-per-brief
  rules, and the reusable shapes (rationalizations · red flags · evidence taxonomy) you
  drop into a gate's `instructions`. Prose steers the work; only the evidence invariant
  enforces it.
- **anchored.yml is deltas only.** The shipped default template
  (`core/default-template/anchored.default.yml`; its shape is documented in
  `plugin/references/anchored-config.md`) is the base — the user file overrides via deep
  merge (steps extend-only by name; scalars win). Touch only what the request implies.

## Procedure (per request)

1. **Read the current `anchored.yml`** at the project root (if absent, start from
   the defaults — everything is a default the user overrides; an empty file = "use
   all defaults").
2. **Map the request to the right slot** (see `plugin/references/anchored-config.md`):
   - a **custom step** under `<tier>.<stage>.steps` (`name` + `instructions`, plus
     an optional `use: { type, name }` worker and `execute: sequential|workflow`),
   - **gate instructions** (the refine/build gate `instructions` slots),
   - the per-tier **`build.retry_limit`** / **`build.stop`** conditions,
   - **custom phase fields** (`task.phase.fields`).
3. **Make the edit** — write `name` + `instructions` on any custom step, and
   `use: { type, name }` when it delegates to a worker. Preserve the user's existing
   config. Two things bite if you wing them — see `plugin/references/anchored-config.md`
   ("A step"):
   - **Position with `after:`/`before:`** a named step (else it appends to the end).
     A bad anchor does NOT error — it silently appends, so verify the *order* in
     step 4, not just that the step is present.
   - **A command goes in `instructions:` prose**, not a step key. The runtime env
     vars available to a main-thread command are exactly `${TASK_SLUG}`,
     `${PHASE_SLUG}`, `${PHASE_NAME}` (phase.build only), `${EPIC_SLUG}`,
     and `${NODE_SLUG}` (the slug of the node currently being built). There is
     **no `$SLUG`**; `git commit -am "$SLUG"` commits an empty message.
4. **Validate + check order**, then **show the changed region** so the user sees what
   landed. Run **`anchored validate`** as the final check — it parses + merges +
   validates the WHOLE yml and reports the resolved shape across every tier×stage
   plus the declared custom fields (an invalid yml comes back as a clean error
   envelope, not a crash). Confirm the new step/field actually appears where the
   request meant it to (the report lists each stage's steps in order — a mis-anchored
   step shows up at the wrong position). Never leave the file invalid.

## Onboarding (no anchored.yml yet)

When invoked because a `/a:*` skill found no `anchored.yml` (or the user is
starting fresh), do the **minimum** by default and **offer** more — never force a
tour:

0. **Verify the CLI resolves** (defensive — it should, automatically). The plugin
   ships a bundled `anchored` in its `bin/`, which Claude Code adds to PATH on
   install, so `anchored` is normally already callable with zero setup. Run a quick
   `anchored version`. If it errors (`command not found`), the plugin isn't enabled
   or `bin/anchored` is missing/not executable — tell the user to enable the
   anchored plugin (and, for a dev checkout, run `npm --prefix core run
   bundle:plugin`). Do **not** attempt an `npm i -g`; the `bin/` mechanism is the
   install path. If `anchored version` works, say nothing and continue.
1. **anchored needs no config to run** — a missing `anchored.yml` means "use all
   defaults", so planning/building proceed immediately. To show the user what's
   tunable, **drop a commented starter**: copy `plugin/references/anchored.starter.yml`
   to `<project-root>/anchored.yml` (only if none exists — never clobber a real one).
   Every block in it is commented out, so it changes nothing until the user
   uncomments something. Say in one line that it's there as a self-documenting
   example. (The `Bash(anchored *)` allowlist is remembered by Claude Code the first
   time the user approves an `anchored` call — that's the harness, not anchored.)
2. Offer, as a single question, to tune it together now vs later:
   > "Anchored's already running on the defaults. Want to quickly tailor it to your
   > project (linter/test command, commit-per-phase, …), or just the essentials for
   > now and you handle it later with `/a:setup`?"
   - **Set it up together now** → walk the 1–3 things that actually matter for
     their repo (their test/lint command, optional commit-per-phase), each as a
     real edit you show.
   - **Just the essentials for now** → stop here; the defaults stand, `/a:setup` is
     there whenever they want.

## Boundaries

- Edit only the project's `anchored.yml` (and, if the user explicitly wants it,
  related `.claude/` files). Never modify the anchored package or anything outside
  the project root.
- Don't invent toolchain commands. If you need the user's lint/test/build command
  and can't detect it from the repo, ask.
- Don't add steps, fields, or gates the user didn't ask for. A suggestion is a
  one-liner they can wave off — not an edit you make unasked.
