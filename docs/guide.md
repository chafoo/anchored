← [docs](_docs.md)

# anchored — guide

New to anchored? This is the one-page on-ramp: what it is, how a run feels, and
the fastest way to see it work for real. For the full command surface see
[api](api.md); for the deeper model see [tiers](tier/_tier.md) and
[stages](stages/_stages.md).

## The one idea

An AI agent stops when the work *looks* done — and "done" is generated language,
not a verified state. So you become the verification loop: every mistake waits for
you to notice it.

anchored closes that gap in the **substrate**, not in a prompt. The rule is hard
and lives in the data model: **no acceptance criterion reaches `done` without
`evidence`** — the real test output, the command that ran and what it returned, a
browser-observed result. An independent checker records that proof; the agent that
wrote the code never marks its own work done. Run an agent for hours and you still
trust the result, because nothing green is unproven.

> We secure the *proof*, never the *work*. Everything else — your tests, commits,
> gates, tools — is configurable. That one rule is not.

## The lifecycle in 30 seconds

The same four stages run on every scale — **epic ▸ task ▸ phase**. That is the
fractal: one form, three sizes.

| Stage | What happens | Command |
| --- | --- | --- |
| **plan** | Decompose the work into phases with *testable* acceptance criteria. | `/a:plan <describe a task, epic, or phase>` |
| **refine** | Ground the plan against the real code + rules, walk the open questions. | `/a:refine <slug>` |
| **build** | Implement and **verify** phase by phase — evidence is recorded per criterion. | `/a:build <slug>` |
| **wrap** | Review + summary (and, for an epic, roll up across its tasks). | `/a:wrap <slug>` |

The tier is just an argument of `plan`; nesting lives in the slug
(`my-epic/login/setup`). Pick **task** for a unit of work, **epic** for a goal that
spans several tasks, **phase** for a single leaf of criteria.

## Install

Two commands in Claude Code — see the [Quick start](../README.md#quick-start) in
the README. The CLI ships inside the plugin, so there is nothing to `npm i -g` and
no MCP to set up.

## See it work — the kata

The fastest way to *feel* the evidence loop is the runnable kata in
**[`examples/task-app/`](examples/task-app/)**: a real product ticket that anchored
plans, builds, and wraps end-to-end — every logic criterion backed by actual
`bun test` output, every DOM criterion by a browser-observed result. You spin it up
in a fresh repo and drive the full `plan → refine → build → wrap` yourself.

Its [README](examples/task-app/README.md) has the step-by-step. Working through it
once is the best way to internalise how a run feels and what the evidence trail
looks like.

## Make it yours

anchored has no privileged built-ins — every opinionated step is config you can
change. Want a linter after each phase, a commit per phase, a PR when a task is
done, or test-driven development enforced on every build? Tell
[`/a:setup`](stages/setup.md) in plain language and it edits your `anchored.yml`
into the right slot. Git stays entirely yours; the engine never runs it for you.

## Go deeper

| Want… | Go to |
| --- | --- |
| Every command and the `/a:*` skills | [api](api.md) |
| What each tier is for | [tiers](tier/_tier.md) — epic · task · phase |
| What each stage does | [stages](stages/_stages.md) — setup · plan · refine · build · wrap |
| The non-negotiable principles | [`CLAUDE.md`](../CLAUDE.md) |
