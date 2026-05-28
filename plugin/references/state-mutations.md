# State mutations — who writes what to the task-file

## TL;DR

**All mutations to `.claude/tasks/<slug>.yml` go through the MCP
factory tools (`mcp__task__*`), and ONLY the SKILLs (running in the
main Claude session) call them.** Plugin-defined custom subagents
(`plan`, `plan-check`, `rules-check`, `implement`, `task-validate`,
`code-validate`, `rules`) return structured output and the SKILL
applies it. NO direct `Write` or `Edit` of task-files from any
actor — not agents, not SKILLs. The factory at
`mcp/src/core/factory.ts` validates schema, enforces state-machine
transitions, and atomic-writes on every call. The renderer
auto-injects the `yaml-language-server: $schema=...` directive on
every write, so even comment metadata stays consistent across
mutations.

V0.3.1 architecture (workaround for Anthropic bugs #13605, #21560,
#33689, #15810 — plugin-defined custom subagents cannot access MCP
tools regardless of configuration).

## Mutation paths by SKILL

All task-file writes happen in SKILL context (main session). Agents
return structured output that the SKILL parses and applies.

| SKILL          | MCP calls it makes                                                                          | Triggered by                                                |
|----------------|---------------------------------------------------------------------------------------------|-------------------------------------------------------------|
| /impl-plan     | `task__create`, `append_plan`, `add_phase` (×N), `question_add` (×M), `set_task_status` (`plan→drafted`) | plan-agent's structured return (Mode A)            |
| /impl-plan     | `add_phase`, `remove_phase`, `move_phase`, `set_phase_name`, `set_phase_context`, `add_ac`, `remove_ac`, `set_ac_text` | plan-agent's diff[] return (Mode B restructure) |
| /impl-refine   | `set_phase_rules`, `set_phase_context`, `append_plan`, `question_add`, `question_retag`, `append_build_section` | plan-check + rules-check agent returns           |
| /impl-refine   | `set_autonomy`, `question_resolve` (×N), `set_task_status` (`drafted→refined`)              | stage 0 user input + stage 3 Q&A walk + stage 5 transition  |
| /impl-build    | `set_phase_status` (`pending→in-progress` / `→done` / `→blocked`), `set_evidence`, `set_field`, `set_failures`, `append_build_section`, `increment_retry`, `set_task_status` (`build→wrap`) | implement + task-validate + code-validate returns + retry-loop accounting |
| /impl-wrap     | `append_wrap_section` (review findings), `set_wrap_intro` (TL;DR), `set_task_status` (`wrap→done`) | /review skill output + summarize step              |

Read-only paths (`task__read`, `task__list_phases`,
`task__list_fields`, `task__get_field`, `task__next_phase`,
`task__question_list`) are open to every actor — they never mutate.
SKILLs typically pre-read task-file content and pass it to agents
in their input (agents have no direct MCP access).

## Failures-driven re-do loop

After implement completes a phase, task-validate fires per AC. For
each AC it rejects, it calls `task__set_failures` — which atomically:

- Sets the `failures` array on the AC
- Flips AC status back to `pending`
- **KEEPS** evidence as history — the implement-agent reads it on
  re-run for context

code-validate runs next with the same atomicity contract; if it
rejects an AC that task-validate already rejected, its failures
supersede (so the AC reflects the LATEST validator's findings).

The /impl-build orchestrator then:

1. Scans all ACs in the phase via `task__read`.
2. If any has a non-empty `failures` field → re-spawn implement for
   that phase.
3. **Before re-spawning**, call `task__increment_retry(slug, phase_slug)`
   — atomically bumps the counter and returns the new value `N`.
4. If `N > anchored.yml.build.retry_limit` (default 3) → transition
   the phase to `blocked` via `set_phase_status`. Failures are
   preserved on the AC — no further retries.

implement reads `ac.failures` on re-run, fixes the underlying issue,
calls `task__set_evidence` with NEW proof. The set_evidence call
atomically:

- Stores the new evidence array
- Flips status to `done`
- Clears the `failures` field

That single write is the recovery primitive — no separate
"clear_failures" call is needed in the happy path.

## Update-mode: the backward-transition exception

Anchored's task-status state machine is forward-only EXCEPT for one
documented exception: update-mode in `/impl-plan` can flip any
post-plan status back to `drafted`. This is the ONLY legitimate path
for `{refined, build, wrap, done} → drafted`.

The exception lives only in `/impl-plan`. Agents, `/impl-refine`,
`/impl-build`, and `/impl-wrap` cannot move a task backward. The
factory's state-machine validator (`assertTaskTransition`) allows
the backward edges to `drafted`, but only `/impl-plan` exercises
them.

After an update-mode edit lands, `/impl-plan` ALWAYS flips status
back to `drafted` so `/impl-refine` re-fires before the next build
attempt. `plan-check` + `rules-check` (the gates inside
`/impl-refine`) then verify the modified plan against current code
and rules — no stale "already refined" assumption is allowed to
mask post-edit drift.

Done phases inside a task on the backward path are additionally
protected at the phase level: `phase.remove` throws
`DonePhaseImmutable` unless the caller passes `{ force: true }`.
The skill prompts the user before forcing; the factory enforces
the contract even if the prompt is skipped.

## Retry-limit guard

`anchored.yml.build.retry_limit` (default 3) caps the re-do loop:

- attempt 1 (fresh) + 2 retries = 3 total attempts before exhaustion
- After exhaustion, the phase is `blocked` with all `failures`
  preserved on each rejected AC
- User intervention required — typical recovery paths:
  - Review failures, fix manually, then
    `anchored phase status set <slug> <ps> in-progress` to resume
  - `anchored phase remove <slug> <ps>` if the AC was wrong
  - `anchored ac status set <slug> <ps> <ac> pending` to clear
    evidence + failures and start fresh on that AC

## Bootstrap exceptions: zero

V0.1 had one Write exception (plan-agent's initial task-file
creation) and one Edit exception (the orchestrator's `→ ?` Q&A
replacement). V0.2 retired both:

- plan-agent now calls `task__create` + `task__append_plan` +
  `task__add_phase` instead of Write
- the /impl-plan orchestrator calls `task__resolve_question` instead
  of Edit

No agent in `plugin/agents/*` has `Write` or `Edit` in its frontmatter
`tools:` list. The `mcp/tests/agent-frontmatter.test.ts` test
enforces this — any reintroduction fails CI.

## Two frontends, one service-layer

| Frontend | Used by                                            | Format                                  |
|----------|----------------------------------------------------|-----------------------------------------|
| **MCP**  | Subagents (called as `mcp__task__<tool>` tools)    | Typed JSON inputs/outputs               |
| **CLI**  | Shell hooks (`run:` steps in anchored.yml), humans | `anchored <noun> <verb> <args...>`     |

Both wrap the same `mcp/src/core/factory.ts` surface. They diverge
only at the I/O boundary — JSON over stdio vs. argv parsing + stdout.

## Atomicity guarantees

The factory's per-AC write contract:

- `evidence.set(...)` — sets evidence, flips status → `done`, clears
  failures. One write.
- `evidence.add(...)` — appends evidence line, flips status → `done`,
  clears failures. One write.
- `failures.set(...)` — sets failures, flips status → `pending`,
  KEEPS evidence as history. One write.
- `failures.clear(...)` — removes failures field; status unchanged.
  One write.
- `status.set('pending')` — full reset: clears evidence + failures.
  One write.

No torn-state bug class is possible on disk — every mutation either
fully succeeds or no write happens.

## Round-trip safety

The renderer preserves:

- Unknown top-level keys (forward compat via Zod `.passthrough()`)
- Unknown phase keys (per-phase extension fields declared in
  `anchored.yml.task.phase.fields` land here; unknown extras pass
  through verbatim)
- `customSections` (user-maintained free-form sections)
- Block-scalar (`|`) formatting for multi-line strings — no line-
  splitting / re-joining hazards

A user can hand-edit their task-file (add notes, add a top-level
`risk_assessment:` key, etc.) and anchored will not eat their edits
during subsequent mutations.

## What MCP doesn't do

- **No bulk operations.** Set evidence per AC, set status per phase.
  Loops happen at the orchestrator level.
- **No transactional batches across multiple ops.** Each call writes
  immediately. The per-op atomicity (above) is the strongest unit;
  for multi-op atomicity, your orchestrator handles rollback.
- **No diff-against-history.** Once written, prior state isn't
  recoverable from the service-layer. Use git for history.
- **No cross-op transactions.** Each op is read → mutate → write.
  Two ops running concurrently (e.g. `Promise.all`) each read
  independently; if they target the same AC, the last write wins
  (RMW race). The cross-process lock (next section) prevents *torn*
  files but does NOT serialize read-modify-write. Sequentialize at
  the orchestrator level when atomicity across ops is needed.

## Concurrency model

Anchored runs safely across multiple sessions / processes via 3 layers:

1. **Event-loop atomicity** (intra-process, sequential awaits): each
   factory op is one async function. As long as the caller awaits
   them sequentially (`await op1; await op2;`), the read → mutate →
   write of op1 completes before op2 reads. No interleaving, no lost
   updates. This is the recommended pattern. `Promise.all` of ops
   on the same task DOES interleave their reads — the lock keeps the
   file uncorrupted, but the LATER write may overwrite the earlier
   one if they touched the same field.

2. **Atomic file writes** (filesystem): every write goes through
   `core/io.ts:atomicWrite` — write to a per-pid + random-suffix
   temp path, then `rename(2)` onto the target. Rename is atomic on
   POSIX filesystems. Crashes mid-write leave the original file
   intact (or a stale temp sibling that gets cleaned up on the next
   write). Readers see either the old or the new file, never a
   partial.

3. **Cross-process locking** (multi-process): `proper-lockfile`
   acquires a `<path>.lock` directory next to the target file
   before every write. If another anchored process holds the lock,
   the caller retries 3× with 100ms backoff (~400ms budget), then
   throws `WriteContention`. Stale locks (10s+ old, no mtime
   refresh — implies a crashed prior writer) auto-reclaim on the
   next acquire.

### Recommended pattern: 1 task = 1 worktree = 1 session

For predictable behavior, treat each task as a single-writer domain:

- One git worktree per active task
- One Claude Code session in that worktree
- `/impl-*` skills run sequentially within the session

Multi-session / multi-process work on the same task is *supported*
(the lock prevents file corruption) but creates avoidable contention
and surfaces lost-update bugs that are easy to avoid with separate
worktrees. Prefer the worktree pattern.

### Parallel quality-gate execution

`/impl-build` spawns `task-validate` + `code-validate` in PARALLEL
(single message, two `Task` tool calls). They read the same task-file
but write to DIFFERENT acceptance criteria (each validator emits
`set_failures` per-rejection, and the two validators don't reject
the same AC for the same reason — task-validate looks at evidence,
code-validate at code-vs-rules). The cross-process lock serializes
their writes; the parallelism saves wall-clock on the LLM-reasoning
side without sacrificing safety.

`/impl-refine`'s `plan-check` + `rules-check` run SEQUENTIALLY (not
parallel) because rules-check needs to see any structural reshaping
plan-check applied — they're a pipeline, not independent reviewers.

## CLI invocation patterns

For shell hooks in `anchored.yml`:

```yaml
build:
  commit: |
    Run `git add -A && git commit -m "feat($TASK_SLUG): $PHASE_NAME"`.
    Then: `anchored phase field set $TASK_SLUG $PHASE_SLUG commit "$(git rev-parse HEAD)"`.
```

Env vars available to `run:` blocks: `$TASK_SLUG`, `$PHASE_NAME`,
`$PHASE_SLUG`. The orchestrator sets these per phase.

For human ad-hoc use:

```bash
# Show what's pending
anchored phase next-pending my-task

# Manually mark a phase deferred
anchored phase status set my-task tricky-thing deferred

# Reset an AC to pending (clears evidence + failures atomically)
anchored ac status set my-task tricky-thing 2 pending
```
