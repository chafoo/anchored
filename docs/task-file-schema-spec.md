---
slug: task-file-schema-spec
status: draft
created: 2026-05-25
---

# Task-File Schema — annotated spec

This is the canonical shape of every `.claude/tasks/<slug>.md` created and
mutated by anchored. Field descriptions are inline as `<description>` —
this file is not a sample, it's a specification.

**Hard rule:** all field names, section names, and structural ordering
listed here are **immutable core**. Everything else is opt-in via
`anchored.yml`. The core is deliberately tiny — minimum that the
lifecycle gates and the agents need to function.

---

## Lifecycle status

Status reflects **the next action**:

| status | Meaning                                  | What's allowed                          |
|--------|------------------------------------------|-----------------------------------------|
| `plan` | next action is `/impl-plan`              | `/impl-plan` runs; build/wrap blocked   |
| `build`| next action is `/impl-build`             | `/impl-build` runs; plan/wrap blocked   |
| `wrap` | next action is `/impl-wrap`              | `/impl-wrap` runs; plan/build blocked   |
| `done` | terminal — nothing more                  | no skill runs without explicit override |

**Skill-completion** flips status to the next value. Mid-flight crashes are
safe: status stays put, phase-level statuses give granularity to resume.

---

## The schema

````markdown
---
slug: <kebab-case identifier, matches filename without .md, immutable after creation>
status: <one of: plan | build | wrap | done>
created: <ISO date YYYY-MM-DD, set once at file creation, never changes>
---

# <Task Title — human-readable, Title Case, freely editable>

## Context
<2–6 sentences: WHY this task exists, WHAT EXISTS, WHAT'S MISSING.
the unchanging framing. written by /impl-plan at creation. rarely edited
after.>

### Plan
<written during /impl-plan. captures everything decided/discussed during
the planning phase:
  - structural decisions the plan agent made
  - Q&A trace from the refinement loop
  - notes the agent thinks future readers/agents will need
free-form bullets. permanent — never deleted, even after task is done.>

- <a decision or note in free prose>
- Q: <question raised during refinement>
  → resolved: <answer in user's words>
- Q: [blocking] <question that was tagged blocking>
  → resolved: <answer>
- Q: <question>
  → deferred: <reason — e.g. "not blocking V1", "out of scope">

### Build
<container for per-agent H4 sub-sections written during /impl-build.
empty header doesn't appear unless at least one sub-section has content.
each contributing agent writes to its own H4 sub-section:>

#### Implement
<written by the implement agent (or user's replacement). per-phase
mid-flight notes — decisions made during implementation, architectural
pivots, anything future readers need. on-demand: section appears only
if implement has notes to write.>

- <phase-slug> / <Phase Human Name>
  <free-form note or decision in 1-3 sentences>
- <next-phase-slug> / <Next Phase Name>
  <note>

#### task-check
<written by the task-check agent (fixed framework agent). per-phase
verdict + findings. always writes at least a one-line verdict per phase
checked, so this section appears as soon as build starts processing
phases.>

- <phase-slug> / <Phase Human Name>
  verdict: <pass | fail | warn> — <one-line summary>
  finding [block|warn|info] ac_index=<N>: <reason>     # only when findings exist
- <next-phase-slug> / <Next Phase Name>
  verdict: pass — all 4 ACs have evidence, file:line refs verified

#### code-check
<written by the code-check agent (fixed framework agent). per-phase
verdict + findings. same convention as task-check.>

- <phase-slug> / <Phase Human Name>
  verdict: <pass | fail | warn> — <one-line summary>
  finding [block|warn|info] <file>:<line>: <reason — rule that was violated>
- <next-phase-slug> / <Next Phase Name>
  verdict: pass — no violations of must_follow rules

#### <user-custom-agent-name>
<optional. if user replaces a default agent or adds a custom one, that
agent gets its own H4 sub-section under ### Build, named after itself.
same entry format: per-phase bullets with slug+name+content.>

### Wrap
<written during /impl-wrap. mix of free-prose TL;DR (from summarize step)
and optional H4 sub-sections from contributing skills/agents.>

<free-prose TL;DR written by summarize step:
  - what shipped vs original plan
  - phase rollup (N done / M deferred / K blocked)
  - notable findings from task-check + code-check
  - total ACs satisfied with real evidence>

#### review
<written if the wrap.review step ran (default config invokes Claude Code's
built-in /review skill). captures the review pass's notable findings.
on-demand: section only appears if the step ran AND had findings to
report. user can replace the wrap.review step prose to use other review
tools — H4 name should match the step name.>

- <finding 1: file:line — what's flagged>
- <finding 2>
- ...

## Phases

### <Human Phase Name — Title Case, 2–6 words, unique within this task>
<!-- id: <kebab-case slug derived from phase name, internal addressing only, never user-facing> -->
- status: <one of: pending | in-progress | done | blocked | deferred>
- <any optional phase-level fields declared in anchored.yml task.phase.fields appear here>
- context: <optional. phase-specific briefing for the build agent — relevant files,
            patterns to follow, things to watch. skip if task-level Context covers it.>
- rules: <optional. must-follow rules that apply specifically to this phase.
          set by plan-agent during /impl-plan by matching rules-agent output
          against phase scope. consumed by code-check during /impl-build.>
  - path: <path to rule file, e.g. .claude/rules/_pattern/factory.md>
    why: <one-line: why this rule applies to this specific phase>
  - path: <next rule path>
    why: <reason>
- acceptance_criteria:
  - <single-sentence testable criterion>
    evidence: <after /impl-build fills: file:line + 1-liner | command + outcome | test-name + result.
               "—" while pending. anchored's USP: no AC is done without a concrete evidence string.>
  - <next criterion — typically 2–6 ACs per phase; if more, split the phase>
    evidence: <—>

### <Next Phase Name>
<!-- id: <next-phase-slug> -->
- status: pending
- acceptance_criteria:
  - <criterion>
    evidence: <—>
````

---

## Core fields (immutable)

### Frontmatter

| Field     | Type   | Mutated by                                                                      | Purpose                                |
|-----------|--------|----------------------------------------------------------------------------------|----------------------------------------|
| `slug`    | string | set once at creation, never                                                      | task identity; matches filename        |
| `status`  | enum   | `/impl-plan` (→build), `/impl-build` (→wrap), `/impl-wrap` (→done)               | lifecycle gate for which skill runs    |
| `created` | date   | set once at creation, never                                                      | sorting / age signals                  |

### Body sections

| Section / sub-section                | Created by                                       | Mutated by                            | Purpose                                |
|--------------------------------------|--------------------------------------------------|---------------------------------------|----------------------------------------|
| `## Context`                         | `/impl-plan` at file creation                    | rarely (corrections only)             | unchanging framing for the task        |
| `### Plan`                           | on-demand (when plan-agent has content to write) | plan-agent during `/impl-plan`        | decisions + Q&A + notes from planning  |
| `### Build`                          | on-demand (when first H4 sub-section appears)    | container only — no direct mutations  | parent of per-agent audit sub-sections |
| `### Build` → `#### Implement`       | on-demand (when implement-agent writes)          | implement-agent (or user replacement) | per-phase mid-flight notes/decisions   |
| `### Build` → `#### task-check`      | on-demand (when task-check writes verdict)       | task-check agent (fixed)              | per-phase verdict + findings           |
| `### Build` → `#### code-check`      | on-demand (when code-check writes verdict)       | code-check agent (fixed)              | per-phase verdict + findings           |
| `### Build` → `#### <custom-agent>`  | on-demand (when user agent writes)               | user's custom agent                   | per-phase notes from custom agents     |
| `### Wrap`                           | on-demand (when summarize or review step writes) | summarize step (free-prose) + H4 sub-sections (per-skill) | post-completion TL;DR + review findings |
| `### Wrap` → `#### review`           | on-demand (when wrap.review step runs)           | wrap.review step (default: /review skill) | review-pass findings                |
| `## Phases`                          | `/impl-plan` at file creation                    | `/impl-build` mutates per-phase       | container for work units               |

**On-demand rule:** sections under `## Context` (including H4 sub-sections
under `### Build`) only exist in the file if content has been written into
them. Empty headers don't appear. Parser treats missing sections as empty
without erroring.

### Per-phase core fields

| Field           | Type   | Mutated by                                            | Purpose                                |
|-----------------|--------|-------------------------------------------------------|----------------------------------------|
| heading (h3)    | string | `/impl-plan` (sets), user may edit                    | human phase name; the only user-facing phase identifier |
| `<!-- id -->`   | string | `/impl-plan` (derived from heading, never changes)    | internal slug for service-layer addressing |
| `status`        | enum   | `/impl-build` orchestrator                            | `pending → in-progress → done | blocked | deferred` |
| `context`       | string | `/impl-plan` (optional)                               | phase-specific briefing for build-agent |
| `rules`         | list   | `/impl-plan` (optional, plan-agent assigns from rules-agent output) | rules that apply specifically to this phase; consumed by code-check during build |
| `acceptance_criteria` | list   | `/impl-plan` creates; `/impl-build` fills evidence    | ordered list of testable criteria with evidence slots |
| `acceptance_criteria[].evidence` | string | `/impl-build` per criterion during execution | concrete proof the criterion is satisfied — anchored's USP |

---

## Extension points (everything else lives here)

The core above is intentionally tiny. Anything beyond it — including
common things like `commit` SHA tracking, coverage percentages, PR URLs,
reviewer assignments — is opt-in via `anchored.yml`.

| Slot in anchored.yml          | Where it lands in task-file                          | Examples                              |
|-------------------------------|------------------------------------------------------|---------------------------------------|
| `task.phase.fields: [...]`    | additional per-phase fields (as new `- key: val` lines after core fields) | `commit`, `coverage_pct`, `pr_url`, `reviewer` |
| `task.fields: [...]` (V0.3+)  | additional frontmatter top-level keys                | `jira_id`, `priority`, `assignee`     |
| `task.status.add: [...]` (V0.3+)| extends task `status` enum (additive only)         | `on-hold`, `archived`                 |
| `task.phase.status.add: [...]` (V0.3+)| extends phase `status` enum (additive only)  | `blocked-external`                    |
| `task.sections.add: [...]` (V0.3+)| new `## <name>` body sections, position-controlled | `## Risk Assessment`, `## Notes`    |

**`commit` is an extension, not a core field.** Users who don't want
auto-commits never see commit-related noise in their task-files.
Users who do, declare it in their `anchored.yml` along with the step
or hook that populates it.

### Round-trip guarantee

The service-layer reads, mutates, and re-renders task-files without
losing any extension content. If `task.metadata: [jira_id]` is declared
and a `jira_id:` line appears in frontmatter, the field survives every
mutation cycle untouched.

### No removal, no rename

Users cannot disable core fields. The core schema is invariant;
extensions live alongside it.

---

## Open conventions (decided in our session, codified here)

- **Phase-status enum stays** at `pending | in-progress | done | blocked | deferred`. Phase-level status is orthogonal to task-level status.
- **`acceptance_criteria` is the key name**, fully spelled out. Self-documenting; matches the "evidence per criterion" pattern; no ambiguity for new readers.
- **Refinement Q&A convention:** `Q: <text>\n  → resolved: <answer>` or `→ deferred: <reason>`. Non-Q decisions appear as plain bullets in the same `### Plan` section.
- **HTML-comment slug** (`<!-- id: ... -->`) chosen over inline `- id:` bullet so users aren't tempted to reference slugs in chat (sb-bot lesson — slug-references confuse users in long sessions).
- **H4 sub-sections under `### Build` are named after the writing agent.** Default agents (`Implement`, `task-check`, `code-check`) get fixed names. User custom/replacement agents get their own name (e.g., `#### my-bdd-worker`). One H4 per contributing agent — no shared bins.
- **Per-phase entry format under H4** is `- <slug> / <Human Phase Name>` as the bullet header, with note/finding/verdict as indented content underneath. Lets readers grep by phase slug or scan by phase name.
- **task-check + code-check always write at least a one-line verdict per phase** they processed (even if `pass` with no findings) — keeps the audit trail complete. Implement only writes when there's a real mid-flight note to capture (no-news = no entry).
- **Per-phase `rules:` field set by plan-agent.** The rules-agent runs once during /impl-plan and returns global must_follow/worth_knowing lists. Plan-agent matches each rule to phases based on phase scope (which files/patterns each phase touches), and writes a per-phase `rules:` list with `path` + `why`. Code-check reads this per-phase list during /impl-build — knows exactly which rules apply where.
- **Resume-after-crash is automatic.** When `/impl-build` finds a phase with `status: in-progress`, it re-spawns implement on that phase. Implement reads the task-file first, identifies acceptance_criteria with non-empty evidence (already done), and continues with the rest. The implement agent's prompt explicitly handles this idempotency contract.
- **Explicit reset is opt-in.** To restart a phase from scratch (e.g., after major refactor or context compaction), the user clears the phase's evidences and sets `status: pending` directly in the task-file. The file is single source of truth — anchored treats reset phases as fresh on next /impl-build. A service-layer `phase.reset(slug, phase_slug)` convenience op may land in V0.3.
- **task-check runs on blocked phases too.** Even when implement marks a phase blocked (some ACs unsatisfiable), task-check still verifies the partial evidences that ARE present — honest verdict for what was done. Phase stays blocked; task-check's verdict reflects the partial work quality.
- **Wrap section is hybrid:** free-prose TL;DR (from summarize step) PLUS optional H4 sub-sections per contributing skill/agent (e.g., `#### review` for /review findings). Unlike `### Build` which is pure H4-per-agent, `### Wrap` allows direct prose because summary is task-level not per-agent.
