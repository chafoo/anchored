---
name: refine
description: Validate a drafted plan against current code + rules and walk the open questions before build. Triggers ONLY on the explicit `/a:refine <slug>` command. Runs plan-check + rules-check + the question-walk via the `anchored` CLI. Use for `/a:refine`, not for general code review.
---

# /a:refine — fractal refine stage

Explicit-only: the user typed `/a:refine <slug>`.

## Pre-flight

- Load `anchored.yml`. Resolve the `<slug>` to a task/epic node.
- State gate: refine expects a `drafted` node; the CLI reports if the status is wrong.

## Run (CLI-only, via Bash)

The tier is **derived from the node** — the only argument is the slug. The refine
stage runs entirely through the `anchored` CLI (no MCP, no raw node-file edit):

```bash
anchored refine <slug>
```

This drives `plan-check → rules-check → walk` (the question-walk respects the
stage's `involve` level). The CLI emits a JSON envelope; relay what was resolved
and what stays open. After refine, the node is `refined` and ready for `/a:build`.
