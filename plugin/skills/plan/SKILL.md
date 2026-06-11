---
name: plan
description: Brainstorm a raw task description into a drafted plan with phases + testable acceptance criteria. Triggers ONLY on the explicit `/a:plan <epic|task|phase>? <description>` command. Decomposes the work and surfaces open questions via the `anchored` CLI; classifies the tier when it is omitted. Use for `/a:plan`, not for general planning chatter.
---

# /a:plan — fractal plan stage

Explicit-only: the user typed `/a:plan …`. Don't second-guess whether they meant
it — they did.

## Pre-flight

- Load `anchored.yml` from the project root. If it's missing, lazy-init a minimal
  one (schema directive + a pointer to the shipped default reference). Add
  `Bash(anchored *)` to `.claude/settings.local.json` so the CLI runs without a
  prompt.
- Derive a slug from the input — kebab-case, short; nested `<epic>/<slug>` when
  planning under an existing epic.

## Run (CLI-only, via Bash)

The plan stage runs **entirely through the `anchored` CLI** — never MCP, never a
raw Write/Edit on the task-file. The CLI emits a JSON envelope; relay the result.

```bash
anchored plan <tier?> <input>
```

- With an explicit tier (`epic` | `task` | `phase`): runs directly.
- Without a tier: **classify-routing** picks one (below), then runs.

## classify-routing — ephemeral skill logic (NOT a persisted step, NOT an agent)

This routing lives **only in this skill**: it writes no `classify` step into the
task-file and spawns no `classify` agent. It runs **only when the tier argument is
missing**. `discover` probes the codebase, then the thresholds
(fractal-redesign-notes.md):

- **`<5` phases → `task`**
- **`5–9` → independence test** (does each unit need its own
  plan→refine→build→wrap?) → `task` or `epic`
- **`≥10` → `epic`**

Surface the recommendation, confirm with the user (`AskUserQuestion`), then run
`anchored plan <chosen-tier> <input>` via Bash.

Exit with the open questions still open — `/a:refine` walks them next.
