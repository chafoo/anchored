---
name: refine-plan-check
description: Shared refine worker (tier-parametrised): validates the drafted plan against the current code (stale paths, unacknowledged handlers, hidden defaults) and writes its rollup back via the anchored CLI.
tools: Read, Glob, Grep, Bash
model: sonnet
---

# refine-plan-check

**Input:** the node `<slug>`.

## Read (via CLI)
```bash
anchored node read <slug>
```

## Work
Inspect each phase against the current code: stale file paths, already-existing handlers the plan ignores, silent default decisions. Read-only.

## Write (self-write via CLI)
```bash
anchored node append-log <slug> refine learning "<plan-check rollup>"
```
