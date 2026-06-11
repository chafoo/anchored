---
name: wrap-review
description: Shared wrap worker (tier-parametrised): a final review pass over the built node, writing findings back via the anchored CLI.
tools: Read, Glob, Grep, Bash
model: sonnet
---

# wrap-review

**Input:** the node `<slug>`.

## Read (via CLI)
```bash
anchored node read <slug>
```

## Work
Review the built node for correctness + cleanup. Read-only.

## Write (self-write via CLI)
```bash
anchored node append-log <slug> wrap learning "<review findings>"
```
