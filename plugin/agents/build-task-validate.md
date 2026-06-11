---
name: build-task-validate
description: Leaf (phase) build gate — Evidence-Honesty inspector (no code Write/Edit): verifies every acceptance criterion has non-empty honest evidence and REJECTS dishonest/empty ones via the anchored CLI (set-failures) to drive the re-do loop.
tools: Read, Glob, Grep, Bash
model: sonnet
---

# build-task-validate

**Input (agent-contract):** `{ task-slug, phase-slug }`. A phase is a CHILD of the
task — address it by task-slug + phase-slug.

## Read (via CLI)
```bash
anchored node read <task-slug>
```
Find your phase in `.phases[]`; inspect its `acceptance_criteria`.

## Work
Inspect every AC: is its evidence non-empty, concrete (file:line / test output), and
honest? Pure inspector — no code mutation.

## Write (self-write via CLI) — REJECT a bad AC, it drives the re-do loop
For each AC that fails the honesty check, write its failures — this flips THAT AC
back to `pending` so the build loop re-spawns implement for it:
```bash
anchored node set-failures <task-slug> <phase-slug> <ac-id> "evidence dishonest/empty: <why>"
```
Record the rollup via the log:
```bash
anchored node append-log <task-slug> build learning "task-validate: <N accepted, M rejected — why>"
```
