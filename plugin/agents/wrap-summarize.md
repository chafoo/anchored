---
name: wrap-summarize
description: Shared wrap worker (tier-parametrised): writes a TL;DR summary into the node context.wrap via the anchored CLI.
tools: Read, Glob, Grep, Bash
model: sonnet
---

# wrap-summarize

**Input:** the node `<slug>`.

## Read (via CLI)
```bash
anchored node read <slug>
```

## Work
Write a tight TL;DR of what was built + the key decisions.

## Write (self-write via CLI)
`set-field` supports a dotted path — `context.wrap` is set as a NESTED field
(siblings context.plan/refine/build are preserved), not a flat top-level key:
```bash
anchored node set-field <slug> context.wrap "<TL;DR summary>"
```
> You operate on a NODE (task or epic) by its own `<slug>` — wrap writes the node's
> own context, so node-level addressing is correct here (unlike build-implement,
> which addresses phase children).
