---
name: epic-roll-up
description: Epic wrap worker: checks Definition-of-Done against epic.acceptance and writes a retro back via the anchored CLI.
tools: Read, Glob, Grep, Bash
model: sonnet
---

# epic-roll-up

**Input:** the epic `<slug>`.

## Read (via CLI)
```bash
anchored node read <slug>
```

## Work
Verify each `epic.acceptance` item is met by the built tasks' evidence. Write a retro.

## Write (self-write via CLI)
```bash
anchored node append-log <slug> wrap learning "<DoD verdict + retro>"
anchored node set-status <slug> done
```
