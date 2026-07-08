# anchored — the plugin (`a`)

The verification gate for AI work, as a Claude Code plugin. Two skills, one agent, one
hook, one bundled CLI:

- **`/a:run <setup>? <description>`** — anchor a goal into `.claude/anchored/<slug>.yml`,
  work as always, spawn one independent validator per gate, close only on proven-green.
- **`/a:setup <wish>`** — author the project's `anchored.yml` (setups, validator
  instructions, `before`/`after` hooks, custom fields).
- **`agents/validator.md`** — the one agent: the independent evidence author.
- **`hooks/`** — after an accepted plan-mode plan, anchoring is offered as an
  ever-present option (never automatic, never blocking).
- **`bin/anchored`** — the bundled CLI (single-file Node ESM). Claude Code puts
  `plugin/bin/` on PATH; skills and agents call bare `anchored …` over Bash. Rebuild from
  a dev checkout: `npm --prefix core run bundle:plugin`.

References for skills + agents at runtime: [`references/api.md`](references/api.md) ·
[`references/run-file.md`](references/run-file.md) ·
[`references/anchored.example.yml`](references/anchored.example.yml).

Install (marketplace lives in the repo root):

```
/plugin marketplace add chafoo/anchored
/plugin install a@anchored
```
