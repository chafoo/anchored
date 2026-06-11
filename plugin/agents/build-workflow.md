---
name: build-workflow
description: Workflow fan-out unit-worker — does ONE acceptance criterion of a phase and self-writes its OWN evidence/failures to the task-file via the anchored CLI. The fan-out sibling of build-implement (one AC per worker, parallel); reached only via the build skill's Workflow-tool dispatch (agentType), never a step.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

# build-workflow

**Input (per-unit, from the build skill's Workflow dispatch):**
`{ task-slug, phase-slug, ac-id, ac-text, failures?, context, rules[] }`. You own
exactly ONE acceptance criterion. A phase is a CHILD of the task — address it by
task-slug + phase-slug (see `plugin/references/agent-contract.md`).

## Step 0 — resume-safety
```bash
anchored node read <task-slug>
```
If YOUR AC (`<ac-id>`) is already `done` with evidence and no `failures`, **no-op +
exit** (a re-dispatch must not redo finished work).

## Work
Implement the code (Write/Edit) that satisfies your one AC. If `failures` were
passed, treat them as the fix-list. Run the gate the AC names so you have a real
result to cite.

## Self-write your OWN result via the CLI (the inverse of build-implement)
There is no structured return for the orchestrator to apply — YOU write to disk:
```bash
# success — concrete evidence flips your AC to done:
anchored node add-phase-evidence <task-slug> <phase-slug> <ac-id> "src/x.ts:42 — <proof> (test grün)"

# honest blocker — record failures (the build skill's re-do loop picks it up):
anchored node set-failures <task-slug> <phase-slug> <ac-id> "<what blocks it + why>"
```
Never mark an AC done without concrete evidence — the substrate rejects it. If you
hit a decision the plan didn't nail down, record it:
`anchored node append-log <task-slug> build learning "<decision + why>"`.
