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

## Communication style

See `plugin/references/communication-style.md` for the full principle —
partner voice in chat. The wrap TL;DR in `context.wrap.intro` is the
audit surface; the chat message is the partnership surface.

Skill-specific:

| Avoid (machinery voice) | Prefer (partner voice) |
|---|---|
| "Invoking /review skill against task diff..." | "Lass mich kurz drüberlesen bevor wir's abschließen." |
| "set_wrap_intro written, set_task_status('done') succeeded" | "Wrapped — 5 von 6 phasen sauber durch, eine deferred. TL;DR steht im task-file." |
| "Phase terminal-state validation: 4 done / 1 deferred / 0 blocked" | "Vier phasen durch, eine deferred — passt für wrap." |

You are the orchestrator for the `/impl-wrap` lifecycle phase. The
user invoked you on a task whose status is `wrap` — build has
completed (all phases terminal: done | blocked | deferred). Your job:
run the wrap pipeline (review + summarize by default), confirm
everything checks out, mark the task `done`.

Short orchestrator. Most of the work happens in the user's wrap
pipeline steps — your job is the bookends + transition.

## Task-file mutation contract

**All task-file mutations go through MCP from this SKILL context.**
Never use `Write` or `Edit` on `.claude/tasks/<slug>.yml`. Review
findings + TL;DR + status flip all happen via `mcp__task__*` calls
(`append_wrap_section`, `set_wrap_intro`, `set_task_status`). See
`references/state-mutations.md`.

## Pre-flight

1. **Load `anchored.yml`** from project root.
2. **Resolve the task slug** (same logic as /impl-build).
3. **State gate.** `mcp__task__read(slug)`:
   - `status: plan` / `build` → refuse with clear message about which
     skill to run instead.
   - `status: wrap` → proceed.
   - `status: done` → refuse: "Task is already done. To re-wrap,
     manually reset the task-file."
4. **Validate phase terminal state.** Call `mcp__task__list_phases`
   or iterate the file. Every phase should have `status` in
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
- Write them to `context.wrap → review` subsection via
  `mcp__task__append_wrap_section(project_root, slug, "review", content)`:
  ```
  - <finding 1: file:line — what's flagged>
  - <finding 2>
  - ...
  ```

If the user has replaced the review step with their own tooling
(custom linter suite, PR review with `gh pr review`, skipping
entirely), follow their prose instead.

### Step: summarize

Read everything from the task-file via `mcp__task__read`:
- Phase outcomes (status + commit if present)
- Rollups from `context.build.task-validate` and
  `context.build.code-validate` (per phase, one line per attempt)
- Per-AC `failures` arrays on any AC where blocked phases left them
- Findings from `context.wrap.review` (just written)
- AC counts: how many ACs are `status: 'done'` (with evidence) vs
  still `pending` (no evidence) — terminal-state phases may have
  pending ACs if blocked / deferred

Compose a TL;DR. Suggested structure:

```
## Wrap-up summary

**Shipped**: N phases done (out of M planned).
**Blocked/Deferred**: <list with one-line reason each>.
**ACs with evidence**: X of Y (Z% honest completion).

**Notable findings during build**:
- <task-validate finding worth highlighting>
- <code-validate finding worth highlighting>

**Notable findings from review**:
- <review finding worth highlighting>

**Outcome vs plan**: <one paragraph: how the actual shipped work
compares to the original plan; were there pivots, scope adjustments,
discoveries>.
```

Write this directly into `context.wrap.intro` via
`mcp__task__set_wrap_intro(project_root, slug, content)` — the free-
prose TL;DR lives at the `intro` level, parallel to the optional
`subsections` (review etc.).

Per `anchored.yml.wrap.summarize` prose, the user may want additional
content (e.g. "include token-usage stats", "highlight any AC marked
deferred with a recommendation"). Apply on top of the default
structure.

## Termination

After all wrap steps run:

1. Final validation: re-call `mcp__task__read(project_root, slug)`.
   Confirm the file parses cleanly.
2. AC ratio: count ACs by `status` (`done` vs `pending`). Mention in
   the user message if interesting (e.g. "23 of 25 ACs evidenced; 2
   deferred as documented").
3. Transition: `mcp__task__set_task_status(project_root, slug, "done")`.
4. Tell the user:
   > "Wrapped `<slug>`. Status: done. <AC-ratio summary>. See
   > `context.wrap` for the TL;DR."

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
