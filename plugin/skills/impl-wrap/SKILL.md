---
name: impl-wrap
description: |
  Finalize an anchored task whose build phase is complete. Runs the
  user's wrap pipeline (default: Claude Code's built-in /review skill
  for a final code-review pass, then writes a TL;DR summary), validates
  all phases are terminal, transitions task status `wrap → done`.
  Explicit-only trigger — user types `/impl-wrap` (optionally with a
  task slug).
---

# /impl-wrap

You are the orchestrator for the `/impl-wrap` lifecycle phase. The
user invoked you on a task whose status is `wrap` — build has
completed (all phases terminal: done | blocked | deferred). Your job:
run the wrap pipeline (review + summarize by default), confirm
everything checks out, mark the task `done`.

Short orchestrator. Most of the work happens in the user's wrap
pipeline steps — your job is the bookends + transition.

## Pre-flight

1. **Load `anchored.yml`** from project root.
2. **Resolve the task slug** (same logic as /impl-build).
3. **State gate.** `mcp__anchored__task_read(slug)`:
   - `status: plan` / `build` → refuse with clear message about which
     skill to run instead.
   - `status: wrap` → proceed.
   - `status: done` → refuse: "Task is already done. To re-wrap,
     manually reset the task-file."
4. **Validate phase terminal state.** Call `mcp__anchored__ac_list` or
   iterate the file. Every phase should have `status` in
   `{done, blocked, deferred}`. If any are `pending` or `in-progress`,
   refuse with: "Task <slug> still has non-terminal phases (X
   pending, Y in-progress). Run `/impl-build` first."

## Pipeline

Run each step from `anchored.yml.wrap.steps` in declaration order.

For the default pipeline (`review` → `summarize`):

### Step: review
Invoke Claude Code's built-in `/review` skill on the task's
implementation diff. The prose in `anchored.yml.wrap.review` (or
defaults) instructs:

- Invoke /review on the changes since the task started (e.g. since
  the first phase's `commit` field if auto-commit is on, or against
  the working tree if not).
- Capture notable findings — typically the most impactful 3-10.
- Write them to `### Wrap → #### review` via
  `mcp__anchored__context_append`:
  ```
  - <finding 1: file:line — what's flagged>
  - <finding 2>
  - ...
  ```

If the user has replaced the review step with their own tooling
(custom linter suite, PR review with `gh pr review`, skipping
entirely), follow their prose instead.

### Step: summarize

Read everything from the task-file via `mcp__anchored__task_read`:
- Phase outcomes (status + commit if present)
- Findings from `#### task-check` and `#### code-check` (per phase)
- Findings from `#### review` (just written)
- AC counts: how many have non-empty evidence vs how many are `—`

Compose a TL;DR. Suggested structure:

```
## Wrap-up summary

**Shipped**: N phases done (out of M planned).
**Blocked/Deferred**: <list with one-line reason each>.
**ACs with evidence**: X of Y (Z% honest completion).

**Notable findings during build**:
- <task-check finding worth highlighting>
- <code-check finding worth highlighting>

**Notable findings from review**:
- <review finding worth highlighting>

**Outcome vs plan**: <one paragraph: how the actual shipped work
compares to the original plan; were there pivots, scope adjustments,
discoveries>.
```

Write this directly into `### Wrap` (NOT as an H4 sub-section — the
free-prose TL;DR goes under `### Wrap` itself, parallel to the
optional H4 `#### review` block above it).

Per `anchored.yml.wrap.summarize` prose, the user may want additional
content (e.g. "include token-usage stats", "highlight any AC marked
deferred with a recommendation"). Apply on top of the default
structure.

## Termination

After all wrap steps run:

1. Final validation: re-call `mcp__anchored__task_read(slug)`. Confirm
   the file parses cleanly.
2. AC ratio: count `evidence: —` vs filled. Mention in the user
   message if interesting (e.g. "23 of 25 ACs evidenced; 2 deferred
   as documented").
3. Transition: `mcp__anchored__task_status_set(slug, "done")`.
4. Tell user:
   > "Wrapped `<slug>`. Status: done. <AC-ratio summary>. See
   > `### Wrap` for the TL;DR."

## Framework defaults (always run)

- Refuse to run if task status ≠ `wrap`.
- Validate all phases are in terminal state (done | blocked |
  deferred). Defensive check — shouldn't happen if `/impl-build`
  exited cleanly, but cheap to verify.
- Count ACs with evidence vs without; surface ratio in summary.
- Transition task status `wrap → done` after summary writes.

## What anchored does NOT do at wrap time

- **No git push.** If the user wants to push (or create a PR), they
  add a custom wrap step that calls `gh pr create` or similar.
- **No automatic announcement / notification.** Same — user step.
- **No auto-archive.** The task-file stays in `.claude/tasks/`.
  User can manually archive or delete.

The framework's contract ends at "task is honestly marked done with
evidence-grade audit trail". Beyond that is the user's workflow.

## References on demand

- `references/task-file-schema.md`
- `references/state-mutations.md`
