# anchored

> Long autonomous AI coding runs you can actually trust.
> Every claim has proof. Every decision is on the record. Every step is configurable.

## What it does

anchored runs AI coding work as a **fractal lifecycle**: the same four stages —
**plan → refine → build → wrap** — on every tier, **epic ▸ task ▸ phase**. An epic
decomposes into tasks, a task into phases, a phase into evidence-gated acceptance
criteria. One form, three scales.

AI writes. anchored secures the *proof*. The one thing enforced in the substrate:
**no acceptance criterion reaches `done` without evidence** — so a run can't claim
done before it actually is. Everything else — what each step does, the data-model
fields, your git policy — is configurable template, not baked-in behaviour. It
secures the proof, never the work; git stays entirely yours.

setup. plan. refine. build. wrap. ship.

## How it works

| Stage | What it does on a tier |
|---|---|
| **plan** | brainstorm + decompose into children; surface every ambiguity as a question, never a silent default |
| **refine** | ground the plan against the real code, walk the open questions, gate it |
| **build** | implement each child; two gates per phase — evidence-honesty + rule-adherence |
| **wrap** | review + summarize; an epic rolls its tasks up against their promised outcomes |

A looping tier (epic, task) fans its ready children out in parallel; a phase is the
sequential leaf. The recursion is intrinsic — `build.each` (epic→task, task→phase) —
not configurable. Nesting lives entirely in the slug (`my-epic/login/setup`).

## Quick start

```
/plugin marketplace add chafoo/anchored
/plugin install anchored@chafoo
/reload-plugins
```

Then, inside any project's Claude Code session:

```
/a:plan <describe an epic, a task, or a phase>   # the tier is an argument of plan
/a:refine <slug>                                  # ground + Q&A walk + gates
/a:build <slug>                                   # implement + verify per phase
/a:wrap <slug>                                     # review + summary (+ roll-up)
```

Stop at any stage and pick up later — the node-file under `.claude/anchored/`
holds the state, so re-running a command resumes where you left off.

The `anchored` CLI ships **inside** the plugin (`bin/`) — Claude Code puts it on
PATH automatically, in the main session and in subagents. **No `npm i -g`, no MCP,
no setup.** One transport: the CLI over Bash, everywhere.

## Configuration

`/a:setup` tailors `anchored.yml` at your project root. The file is **deltas
only** — it overrides the shipped default template; touch only the slots you want.

Every stage ships default steps but is fully extensible — add custom steps
(per-phase commits, lint/test/build gates, PR creation, deploy hooks), tune the
gate instructions, set per-tier retry limits + stop conditions, or declare custom
phase fields. A step's command lives in its `instructions` prose; `with:` marks a
parallel batch; `after:`/`before:` position it. See
[`references/anchored-config.md`](./references/anchored-config.md) for the full slot
list, and [`references/api.md`](./references/api.md) for the CLI surface.

## Why CLI-only (no MCP)

v1 was MCP-driven and hit the wall where plugin subagents can't call MCP tools
([#13605](https://github.com/anthropics/claude-code/issues/13605)). anchored is now
**CLI-only** — the `anchored` CLI over Bash behaves like a built-in, works
identically in the main session and in headless subagents, and emits JSON for the
skills + agents to read. One mental model, no broken seam.

## License

MIT — see [LICENSE](../LICENSE).

---

Built by [@chafoo](https://github.com/chafoo). Need help configuring anchored for
your team? Reach out — custom `anchored.yml` setups + onboarding available.
