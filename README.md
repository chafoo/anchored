<div align="center">

<img src="./assets/og-image.png" alt="anchored — long autonomous AI coding runs you can actually trust. Every claim has proof. Every step configurable." width="100%">

<br>

[![license](https://img.shields.io/badge/license-MIT-2dd4bf)](./LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-38bdf8)](https://github.com/chafoo/anchored)
[![version](https://img.shields.io/badge/version-0.5.2-2dd4bf)](https://github.com/chafoo/anchored/releases)

</div>

> **Configure long, autonomous AI runs — `plan → refine → build → wrap`, on epics or tasks — with anchored evidence at every step.**

Shape each step of your work — your tests, commits, gates, your tools — and anchor
evidence to every implementation. With anchored, an AI can run for hours and you still
trust the result: nothing reaches *done* without the proof to back it.

Same lifecycle at every scale — **epic ▸ task ▸ phase**. CLI-only, zero-install plugin, no MCP.

## Why this exists

AI writes code faster than you can verify it.

On a long autonomous run, the app "works." Tests are green. PRs merge. And you still don't fully trust the result — because nobody can see *why* anything was built the way it was, or whether a passing test actually proves the thing it claims to.

Implementation runs at AI speed. Verification runs at human speed. That gap is the problem. Every line generated faster than it's proven becomes an obligation that comes back during review, debugging, and the next refactor.

Better prompts don't close the gap. A prompt is a request, not a guarantee — the agent can skip a criterion, lose track over a long run, or point at a test that doesn't actually prove anything, then write a summary that *sounds* verified.

**anchored moves verification out of your discipline and into the system.** A rule says "please do it this way." A boundary says "you cannot move forward until this is done." anchored is the boundary.

## How it works

Every piece of work moves through the same four steps, and a criterion cannot reach **done** without attached evidence that an independent checker accepts.

| Step | What happens |
| --- | --- |
| **plan** | The task is broken into phases with *testable* acceptance criteria. If a criterion can't be verified, it isn't a valid criterion. |
| **refine** | The plan is checked against the real codebase and your project rules — gaps, bad assumptions, and soft criteria get caught *before* any code is written. |
| **build** | Implementation happens phase by phase. A phase can't be marked done because the code compiles or a test is green — each criterion needs evidence, and that evidence is validated. Insufficient proof or a rule violation → the step is rejected. |
| **wrap** | The run is summarized. Verification already happened during the run; wrap just rolls up what was proven. |

The key move: the agent that writes the code is **not** the one that decides whether it's proven. An independent instance evaluates each criterion — what was required, what changed, which check proves it, whether the evidence is sufficient, whether a rule was violated. Evidence is *structured state*, not prose. The whole workflow lives in a versioned `anchored.yml` at the repo root, so the process is reviewable and the same for everyone on the team — not trapped in one person's head or a chat history.

## Quick start

In Claude Code:

```
/plugin marketplace add chafoo/anchored
/plugin install a@anchored
```

Not on the official Claude Code marketplace yet — this adds the GitHub repo
(`chafoo/anchored`) as a marketplace source. An official listing is the next step.

Then in any project:

```
/a:plan <describe an epic, a task, or a phase>   # the tier is an argument of plan
/a:refine <slug>                                  # ground the plan + Q&A walk + gates
/a:build <slug>                                   # implement + verify, phase by phase
/a:wrap <slug>                                     # review + summary (+ epic roll-up)
```

The CLI ships **inside** the plugin — Claude Code puts `plugin/bin/` on PATH for
you, in the main session and in subagents. No `npm i -g`, no MCP setup.

## Docs

The docs hub is **[`docs/`](./docs/_docs.md)**:

- **[CLI API](./docs/api.md)** — every `anchored <tier> <verb> [slug]` command and the `/a:*` skills
- **[Tier portraits](./docs/tier/_tier.md)** — epic · task · phase, and what each one is for
- **[Lifecycle stages](./docs/stages/_stages.md)** — setup · plan · refine · build · wrap

## Contribute

```bash
git clone https://github.com/chafoo/anchored
cd anchored/core
bun install
bun run test     # the spec-coverage gate + unit + e2e + int suites
bun run build    # tsc → dist/ (Node-compatible artifact)
```

The non-negotiable principles are in [`CLAUDE.md`](./CLAUDE.md).

## Status

Pre-1.0 — the v3 architecture is built and dogfood-validated; APIs may still shift.
Tier model `epic ▸ task ▸ phase`, plugin namespace `a`. Not yet on the official
Claude Code marketplace — install via the GitHub repo as a source (see Quick start).
The engine also lives in `core/` as a standalone package (not yet published); the
plugin bundles the CLI, so users never need it.

## License

MIT — see [LICENSE](./LICENSE).

---

Built by [@chafoo](https://github.com/chafoo).
