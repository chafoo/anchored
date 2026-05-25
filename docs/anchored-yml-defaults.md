---
slug: anchored-yml-defaults
status: draft
created: 2026-05-25
---

# anchored.yml — framework defaults

What the framework runs **out of the box** for each lifecycle phase
(`/impl-plan`, `/impl-build`, `/impl-wrap`): default agents, default
pipelines, framework guarantees, and the rationale behind each default.

For how users **extend or override** these defaults — schema extensions,
custom steps, override-vs-merge semantics, worked feature examples — see
[anchored-yml-customs.md](./anchored-yml-customs.md).

---

## Anchored-shipped agents (referenced in default pipelines)

| Agent         | File                   | Used in       | Replaceable?              | Role                                          |
|---------------|------------------------|---------------|---------------------------|-----------------------------------------------|
| `Explore`     | Claude Code built-in   | `/impl-plan`  | yes                       | code discovery — paths, patterns, similar code |
| `rules`       | `agents/rules.md`      | `/impl-plan`  | yes                       | scans rule files, returns relevance summary    |
| `plan`        | `agents/plan.md`       | `/impl-plan`  | yes                       | decomposes into phases, writes task-file       |
| `implement`   | `agents/implement.md`  | `/impl-build` | yes                       | per-phase worker — code + tests + evidence    |
| **`task-check`** | `agents/task-check.md` | `/impl-build` | **no — extend only**  | evidence-honesty quality gate — ALWAYS runs    |
| **`code-check`** | `agents/code-check.md` | `/impl-build` | **no — extend only**  | rules-adherence quality gate — ALWAYS runs     |

**Replaceable** agents run by default; user can swap by writing different
step prose. **Extend-only** agents are anchored's quality gate — always
run, same-name user prose APPENDED to defaults.

See [anchored-yml-customs.md § Override vs merge](./anchored-yml-customs.md#override-vs-merge--what-happens-when-you-reuse-a-default-step-name)
for the full extension rules.

### Plus built-in skills invoked from defaults

| Skill      | Source                | Used in       | Replaceable?  | Role                                          |
|------------|------------------------|---------------|---------------|-----------------------------------------------|
| `/review`  | Claude Code built-in  | `/impl-wrap`  | yes           | final code-review pass over the task diff     |

`/impl-wrap` invokes Claude Code's built-in `/review` skill as a default
step. Default-config users get a clean review pass without configuring
anything. Replaceable via different step prose.

---

## Pipeline structure (same for all three lifecycle phases)

```yaml
<phase>:
  # ─── Your steps (parsed; edit, add, remove, reorder freely) ────────
  
  <step_name_1>: |
    Natural-language instruction the AI executes.
  
  <step_name_2>: |
    ...

# default — framework guarantees (YAML comments, runs around your steps):
#   • bullet 1
#   • bullet 2
```

**Mechanics:**

- **User-steps** are YAML mapping keys with prose values. Order = file
  order (top-to-bottom).
- **`default:` block** is pure YAML comments. Parser ignores them. They
  exist only to document the immutable framework contract.
- **Framework defaults** are hard-coded in skill orchestrators (`SKILL.md`
  for each `/impl-*`). The comment block exists so users reading
  `anchored.yml` understand the full lifecycle without separate docs.
- User can delete the comment block — anchored still does the actions.
  Default file ships with the comments populated.

---

## /impl-plan defaults

```yaml
plan:
  # Agents used by default (all replaceable — write different prose to swap):
  #   explore (step) → Claude Code's built-in `Explore` agent
  #   rules   (step) → anchored's `rules` agent
  #   refine  (step) → anchored's `plan` agent (writes the task-file via MCP)
  
  # ─── Your steps ─────────────────────────────────────────────────────
  
  explore: |
    Explore the codebase. Identify affected paths, similar existing code,
    and patterns to match. Summarize findings.
  
  rules: |
    Scan project rule files (.claude/rules/ + any user-configured paths).
    Return relevant rules categorized as must-follow vs worth-knowing
    for this task's scope.
  
  refine: |
    Decompose work into 2-6 phases. Each phase needs 2-6 testable
    acceptance criteria. Surface gaps as questions in ### Plan under
    Context. Run a Q&A loop with the user until all blocking questions
    are resolved or deferred.

# default — framework guarantees (runs around your steps):
#   • Refuses to run if task status ≠ `plan` (or file doesn't exist)
#   • Creates the task-file with frontmatter (slug, status, created)
#     when starting from raw input
#   • Initializes standard sections: Context with ### Plan/### Build/
#     ### Wrap sub-headers, plus ## Phases container
#   • Generates phase slugs from phase names (`<!-- id: ... -->`)
#   • Ensures every phase has at least 1 acceptance criterion
#   • Initializes every acceptance criterion with empty evidence (`evidence: —`)
#   • Ensures all [blocking] questions are resolved before transition
#   • Validates task-file schema integrity after your steps complete
#   • Transitions task status: plan → build on success
```

### Rationale per default

| Default | Why |
|---|---|
| Status gate (`plan` only) | Lifecycle integrity; prevents re-planning during build |
| File creation with frontmatter | Predictable starting state for downstream skills |
| Section initialization | `/impl-build` and `/impl-wrap` rely on these sections existing |
| Phase slug generation | Service-layer needs slugs to address phases robustly |
| ≥1 AC per phase | Phase without ACs is meaningless work; would block /impl-build |
| Empty evidence init | Distinguishes "not yet done" (`—`) from corrupt/missing |
| Blocking-Qs resolved | Half-refined plan would derail /impl-build |
| Schema validation | User-step prose could produce malformed output; framework catches it |
| Status transition | Gate for next skill to be runnable |

---

## /impl-build defaults

```yaml
build:
  # Agents used by default:
  #   implement  (step)        → anchored's `implement` agent — REPLACEABLE
  #   task_check (always runs) → anchored's `task-check` agent — EXTEND ONLY
  #   code_check (always runs) → anchored's `code-check` agent — EXTEND ONLY
  
  # ─── Your steps (run for each pending phase, in order) ──────────────
  
  implement: |
    Read the phase carefully (context, acceptance_criteria, decisions
    from ### Plan). For each acceptance criterion, implement the code
    that satisfies it and capture concrete evidence (file:line +
    one-liner, command + outcome, demonstrable result). Methodology
    is yours to choose — replace this prose to specify TDD, BDD,
    code-first, or any other workflow your project uses.
  
  # ─── Extension hooks for fixed framework agents (optional) ──────────
  # task_check and code_check ALWAYS run after your steps above. They're
  # anchored's quality gate. The prose below is APPENDED to each agent's
  # default instructions — use it to add project-specific requirements.
  
  task_check: |
    (extends the framework's `task-check` agent — see agents/task-check.md
    for the default behavior. Optional; omit if defaults are enough.)
    Add project-specific check: also verify metadata fields declared in
    task.phase.fields are preserved on the phase block.
  
  code_check: |
    (extends the framework's `code-check` agent — see agents/code-check.md
    for the default behavior. Optional; omit if defaults are enough.)
    Add project-specific check: flag any new console.log calls as
    warn-severity findings.

# default — framework guarantees (per phase, around your steps):
#   • Refuses to run if task status ≠ `build`
#   • Picks the next phase with status `pending`, exposes it to your steps
#   • Sets phase status: pending → in-progress at phase start
#   • Routes acceptance-criterion evidence writes through the service-layer
#     (your steps call ac.evidence.set; framework validates + persists)
#   • Captures step outcomes / blockers to ### Build under Context
#   • ALWAYS spawns the `task-check` agent (anchored-shipped, framework-fixed)
#     after your steps. Verifies every AC has honest, non-empty evidence.
#     Cannot be disabled. Extend via build.task_check prose (appended to
#     agent's default instructions).
#   • ALWAYS spawns the `code-check` agent (anchored-shipped, framework-fixed)
#     after your steps. Verifies code adheres to must-follow rules from
#     /impl-plan. Cannot be disabled. Extend via build.code_check prose.
#   • Refuses to transition phase to `done` unless ALL acceptance criteria
#     have non-empty evidence (otherwise → blocked)
#   • Sets phase status: in-progress → done when both fixed checks pass +
#     all evidence filled
#   • Sets phase status: in-progress → blocked when any check fails or
#     evidence missing
#   • Loops until all phases reach a terminal state (done|blocked|deferred)
#   • Transitions task status: build → wrap when loop completes
```

### Rationale per default

| Default | Why |
|---|---|
| Status gate (`build` only) | Lifecycle integrity; can't build before planned |
| Phase picker | Resume-after-crash works because state is in the file, not the orchestrator |
| `in-progress` at phase start | Signals partial state; `next_pending` skips in-progress |
| Evidence-write routing | Service-layer enforces type + schema validity; raw Write would brittle |
| Outcome capture to ### Build | Audit trail for what actually happened mid-build |
| **Fixed `task-check` agent always runs** | Anchored's USP enforcement — verifies evidence honesty per phase. User can extend with project-specific checks, cannot disable. |
| **Fixed `code-check` agent always runs** | Anchored's USP enforcement — verifies rules adherence per phase. User can extend with project-specific checks, cannot disable. |
| **"no done without all evidence"** | **anchored's USP enforced as gate, not guideline** |
| `done` vs `blocked` based on checks | Clean per-phase outcome states |
| Loop until terminal | Don't transition skill until every phase resolved |
| Status transition build → wrap | Gate for wrap to be runnable |

---

## /impl-wrap defaults

```yaml
wrap:
  # Agents/skills used by default:
  #   review    (step) → Claude Code's built-in `/review` skill
  #                       (final code-review pass over the task diff)
  #   summarize (step) → main Claude instance (no dedicated agent in V0.2;
  #                       writes summary directly via MCP, can include
  #                       review findings if review step ran first)
  
  # ─── Your steps ─────────────────────────────────────────────────────
  
  review: |
    Invoke Claude Code's built-in `/review` skill to run a final code-review
    pass over the full task implementation. Capture any notable findings —
    they'll be folded into the summary below.
    
    Replace this prose to use a different review tool (e.g. custom linter
    suite), integrate PR inline comments via `gh pr review`, or remove the
    step entirely if reviews happen elsewhere in your workflow.
  
  summarize: |
    Read all phase outcomes, check findings, and any findings from the
    review step above. Write a TL;DR into ### Wrap under Context:
    what was built vs planned, phase rollup, notable findings, total
    criteria satisfied with real evidence.

# default — framework guarantees (runs after your steps):
#   • Refuses to run if task status ≠ `wrap`
#   • Validates all phases are in terminal state (done|blocked|deferred)
#   • Counts ACs with vs. without evidence; surfaces ratio in summary section
#   • Transitions task status: wrap → done
```

### Rationale per default

| Default | Why |
|---|---|
| Status gate (`wrap` only) | Lifecycle integrity |
| Phase terminal validation | Defensive — shouldn't happen if build exited cleanly, but cheap to verify |
| AC ratio surfaced | Final honesty metric: "23 of 25 ACs with evidence; 2 deferred" |
| Built-in `/review` invoked | Default users get a clean review pass without configuring anything; replaceable for users with their own review tooling |
| Review runs before summarize | Lets the summary fold review findings into the TL;DR |
| Status transition wrap → done | Closes the task lifecycle |

---

## What's deliberately NOT in defaults

Anchored stays out of integration concerns. These are user-decided
features that belong in user-step prose or custom shell commands (see
[customs.md](./anchored-yml-customs.md) for how to add them):

- **Auto-commit / git operations** — user adds via custom step + `task.phase.fields: [commit]`
- **Auto-push, branch management, PR creation** — integration-specific
- **Coverage, lint, security scans** — user shells out to their tools
- **Slack/Jira/Linear notifications** — user-defined steps
- **Test-runner invocations** — live inside user's `implement:` / `task_check:` prose

The framework defaults are intentionally minimal — only what guarantees
the lifecycle pipeline stays clean.

---

## Three small decisions baked in

1. **Phase-loop order is declaration order** in V0.2 (top-to-bottom in
   the file). `priority:` field can come in V0.3+ if real demand emerges.

2. **Schema validation runs both pre- and post-step.**
   - Pre-step: warn + abort if file is already corrupt (something else
     mangled it between runs)
   - Post-step: error if user-step prose produced something invalid

3. **`deferred` phases get a one-line note in ### Build** when skipped
   ("Phase X deferred — skipping"). Cheap audit signal for later readers.

---

## Open — to settle before V0.2 ships

- **`default:` rendering on anchored upgrade** — does the comment block
  auto-refresh from current framework defaults, or is it a one-time
  shipped-with-init? V0.2 vote: one-time-shipped; user can re-init to
  refresh.
- **Concurrent /impl-* calls** — if user runs `/impl-build` while
  `/impl-plan` is still running on same task, what happens? Likely
  advisory lock at service-layer level. Out of scope for this ticket.

## References

- [anchored-yml-customs.md](./anchored-yml-customs.md) — user extension patterns
- [skill-naming.md](./skill-naming.md) — `/impl-*` command family
- [task-file-schema-spec.md](./task-file-schema-spec.md) — task-file core schema
- [service-layer-architecture.md](./service-layer-architecture.md) — typed core + generic field ops
- [skill-orchestration.md](./skill-orchestration.md) — how skills/agents wire together
