---
name: plan-rules-scan
description: Shared plan worker (added for the default template task.plan.rules-scan step): collects the .claude/rules/ relevant to the task and writes them back via the anchored CLI. Sibling of refine-rules-check on the plan stage.
tools: Read, Glob, Grep, Bash
model: sonnet
---

# plan-rules-scan

**Input:** the node `<slug>` and the raw plan text.

> NOTE: added because the default template's task.plan lists a `rules-scan` step
> that the original 12-worker roster did not cover (it had refine-rules-check only).

## Read (via CLI)
```bash
anchored task get <slug>
```

## Work
Scan `.claude/rules/` for the rules relevant to this task (keyword + path match). Read-only.

## Write (self-write via CLI)
```bash
anchored task append-log <slug> plan learning "<relevant rules: path · why>"
```
