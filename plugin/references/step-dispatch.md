# Step dispatch — how anchored runs `anchored.yml` steps

The canonical contract for executing user steps from any lifecycle
stage: `plan.steps`, `refine.steps`, `build.steps`, `wrap.steps`. All
four orchestrator skills (`/impl-plan`, `/impl-refine`, `/impl-build`,
`/impl-wrap`) dispatch steps the same way — this file is the single
source of truth they point at.

Each step is already validated by the `Step` schema before you see it:
**exactly one** of `run:` | `use:` is set, and `type:` / `instructions:`
appear **only** on a `use:` step. Run steps in **declaration order**. A
step that fails **halts** the remaining steps for that stage; the task
status stays at its pre-transition value and the failure is surfaced to
the user with the captured output.

## `run:` — shell / prose

Execute via Bash from the project root, with the stage's env vars
exported (the `${TASK_SLUG}` / `${PHASE_SLUG}` … table in
[`EXTENDING.md`](../EXTENDING.md)). Capture stdout + stderr. A non-zero
exit code is a failure → halt. (If a `run:` value reads as prose rather
than a literal command, interpret it as the action to take — the
historical behavior; this is unchanged.)

A `run:` step may also carry `instructions:` — there it is **documentation**:
the rationale for what the shell does and why (audit trail + human/AI
context). It does not change execution; the `run` value is what runs. Fold
it into the step's captured output so the audit trail records the intent.

## `use:` — a named worker, branched on `type`

A `use:` step hands the work to a named worker. The optional `type:`
field (**absent ⇒ `agent`**) selects the invocation mechanism. This is
not cosmetic — the two run in fundamentally different places, so you must
branch on it:

```
type === 'skill'  → Skill tool, IN THIS (the orchestrator's) session
otherwise         → Agent tool, as an ISOLATED subagent
```

### `type: agent` (the default)

Spawn an **isolated subagent** via the **Agent tool** with
`subagent_type: <use>`. The subagent has its own context and **cannot see
this session**, so the prompt must carry everything it needs to act:

- the step's intent (its `name`),
- the step's `instructions` **verbatim**, if present,
- the stage/phase context the worker needs — e.g. for `build.steps`, the
  phase slug + name, and any **pre-read task-file content** it would
  otherwise need MCP for (plugin subagents can't reach MCP — bug #13605 —
  so YOU pre-read and pass the content in, exactly as the `implement`
  worker is fed),
- what to return: a short result the skill can apply (e.g. a phase-field
  value, a findings list).

A subagent that errors, or returns a failure/blocker result → halt.

### `type: skill`

Invoke the named skill via the **Skill tool**, **in this orchestrator's
own session** — NOT as a subagent. Pass the step's `instructions` (if
present) as the skill's args / opening framing. Because it runs
in-session it sees the live conversation context and can drive MCP
directly; the trade-off is no isolation, so reserve `type: skill` for
skills that are safe to run headlessly in the middle of a pipeline. A
skill that reports failure → halt.

> Choosing between them: reach for `type: agent` when the work should be
> sandboxed (the common case — a reviewer, a scanner, a generator that
> shouldn't mutate the orchestrator's context). Reach for `type: skill`
> only when the worker genuinely needs the live session — and is known to
> terminate without waiting on interactive input.

## Capturing output

Capture each step's notable output to the stage's context section via the
stage's append op — `mcp__task__append_build_section` for build,
`mcp__task__append_wrap_section` for wrap, and the
`context.build → refine.<step-name>` convention via
`append_build_section` for refine. One subsection per step, keyed by the
step's `name`.
