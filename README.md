<p align="center">
  <img src="assets/og-image.png" alt="anchored" width="640" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license" />
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-blueviolet" alt="Claude Code plugin" />
  <img src="https://img.shields.io/badge/version-0.7.0-blue" alt="version 0.1.0" />
</p>

> You plan like you always do, the AI works like it always does — anchored freezes your plan, derives criteria from it, and an independent validator must prove each one at the gates. Nothing reaches `done` without evidence.

## Why this exists

AI writes code faster than anyone can verify it. Every line generated faster than it is proven becomes an obligation — validation debt. Prompts don't fix that: an instruction is a rule, not a boundary. anchored moves verification into the system: a criterion cannot reach `done` unless an independent validator attached evidence, enforced by schema on every write.

anchored v3 is deliberately **not a workflow engine**. It owns nothing but the proof: one run file, one CLI, one validator agent, and a close gate that stays shut until every criterion is proven. Your flow stays yours.

## How it works

Every run lives in one file — `.claude/anchored/<slug>.yml` — holding your plan (verbatim, immutable), the derived criteria, and the evidence trail.

| Step | What happens |
| --- | --- |
| **anchor** | Your goal + plan become a run file with testable criteria, each tagged with the setup that knows how to verify it. Gates are sized automatically to the run's `rigor`. |
| **work** | You (and the AI) work exactly as always. Optional one-line claims land in the trail. |
| **validate** | At each gate, one independent validator re-verifies the gate's criteria — executing tests where possible — and authors evidence or a reasoned rejection. |
| **close** | Refused until every active criterion is done-with-evidence. On green, your `after` instructions run (commit, PR — whatever you wired). |

Course changes never rewrite the plan — they append amendments and supersede criteria, so the repo keeps a persistent log of what was asked vs. what was delivered.

## Quick start

```
/plugin marketplace add chafoo/anchored
/plugin install a@anchored
```

Then, in any project:

```
/a:run frontend fix the navbar overflow on mobile
```

Optional: `/a:setup` tailors `anchored.yml` — named setups (`frontend`, `backend`, `release` …), validator instructions, and `before`/`after` hooks.

The CLI ships inside the plugin — Claude Code puts `plugin/bin/` on PATH for you. No `npm i -g`.

## Docs

- [Docs hub](docs/_docs.md) — the map
- [Run](docs/run.md) · [Setup](docs/setup.md) — the two skills
- [Examples](docs/examples/anchored.yml) — commented config + run file

## Contribute

```
git clone https://github.com/chafoo/anchored
cd anchored/core
bun install
bun run test
bun run build
```

The quality gates (lint · format · typecheck · spec-coverage · test · build) must be green — see `.claude/rules/tooling-quality-gates.md`.

## Status

Pre-1.0. The mechanism (schema invariant, atomic store, close gate) is stable by design; surfaces may still move.

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">Built by <a href="https://github.com/chafoo">@chafoo</a></p>
