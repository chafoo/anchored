# Task-file schema

The canonical shape of every `.claude/tasks/<slug>.md` created and
mutated by anchored. Reference for agents (especially plan, implement,
task-check, code-check) and the service-layer parser/renderer.

**Hard rule:** all field names, section names, and structural ordering
listed here are **immutable core**. Everything else is opt-in via
`anchored.yml` extensions.

---

## Lifecycle status

`status` reflects the **next action**:

| status   | Meaning                          | What's allowed                          |
|----------|----------------------------------|-----------------------------------------|
| `plan`   | next action is `/impl-plan`      | `/impl-plan` runs; build/wrap blocked   |
| `build`  | next action is `/impl-build`     | `/impl-build` runs; plan/wrap blocked   |
| `wrap`   | next action is `/impl-wrap`      | `/impl-wrap` runs; plan/build blocked   |
| `done`   | terminal — nothing more          | no skill runs without manual reset      |

Skill-completion flips status to the next value. Mid-flight crashes
are safe: status stays put, phase-level statuses provide resume
granularity.

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
the unchanging framing. written by /impl-plan at creation. rarely edited.>

### Plan
<written during /impl-plan. captures everything decided/discussed during
the planning phase: structural decisions, Q&A trace, notes. permanent.>

- <a decision or note in free prose>
- Q: <question raised during refinement>
  → resolved: <answer>
- Q: [blocking] <question that was tagged blocking>
  → resolved: <answer>
- Q: <question>
  → deferred: <reason — e.g. "not blocking V1", "out of scope">

### Build
<container for per-agent H4 sub-sections written during /impl-build.
on-demand — section doesn't appear unless at least one sub-section
has content. each contributing agent writes to its own H4 sub-section:>

#### Implement
<written by implement agent. per-phase mid-flight notes — decisions
made during implementation, architectural pivots. on-demand.>

- <phase-slug> / <Phase Human Name>
  <free-form note or decision in 1-3 sentences>

#### task-check
<written by task-check agent. per-phase verdict + findings. always
writes at least a one-line verdict per phase processed.>

- <phase-slug> / <Phase Human Name>
  verdict: <pass | fail | warn> — <one-line summary>
  finding [block|warn|info] ac_index=<N>: <reason>     # only if findings

#### code-check
<written by code-check agent. per-phase verdict + findings.>

- <phase-slug> / <Phase Human Name>
  verdict: <pass | fail | warn> — <one-line summary>
  finding [block|warn|info] <file>:<line>: <reason — rule violated>

### Wrap
<written during /impl-wrap. mix of free-prose TL;DR (from summarize step)
and optional H4 sub-sections from contributing skills/agents.>

<free-prose TL;DR>

#### review
<written if the wrap.review step ran (default config invokes /review).>

- <finding 1: file:line — what's flagged>
- <finding 2>

## Phases

### <Human Phase Name — Title Case, 2–6 words, unique within this task>
<!-- id: <kebab-case slug derived from phase name, internal only> -->
- status: <one of: pending | in-progress | done | blocked | deferred>
- <any optional phase-level fields declared in anchored.yml task.phase.fields appear here>
- context: <optional. phase-specific briefing for the build agent.>
- rules: <optional. must-follow rules that apply specifically to this phase.
          set by plan-agent during /impl-plan, consumed by code-check.>
  - path: <path to rule file>
    why: <one-line: why this rule applies to this specific phase>
- acceptance_criteria:
  - <single-sentence testable criterion>
    evidence: <after /impl-build fills: file:line + 1-liner | command + outcome | test-name + result.
               "—" while pending. no AC done without a concrete evidence string.>
  - <next criterion>
    evidence: <—>
````

---

## On-demand sections

Sub-sections under `## Context` only exist if content has been written
into them:

- `### Plan` — appears once plan-agent writes (which it always does).
- `### Build` — appears once any agent writes to one of its H4
  sub-sections.
- `### Build → #### Implement` — appears when implement-agent writes
  mid-flight notes (optional).
- `### Build → #### task-check` — appears when task-check writes its
  first verdict (typically first phase processed).
- `### Build → #### code-check` — appears when code-check writes
  its first verdict.
- `### Build → #### <custom-agent>` — appears when user-defined or
  replacement agents write. H4 name = agent name.
- `### Wrap` — appears once /impl-wrap's summarize step writes.
- `### Wrap → #### review` — appears if /impl-wrap's review step ran.

Parser treats missing sections as empty. Don't error on absence.

---

## Core fields (immutable)

### Frontmatter

| Field     | Type   | Mutated by                                      | Purpose                          |
|-----------|--------|-------------------------------------------------|----------------------------------|
| `slug`    | string | set once at creation, never                      | task identity; matches filename  |
| `status`  | enum   | `/impl-plan` (→build), `/impl-build` (→wrap), `/impl-wrap` (→done) | lifecycle gate |
| `created` | date   | set once at creation, never                      | sorting / age signals            |

### Per-phase core fields

| Field                            | Type   | Mutated by                                | Purpose                          |
|----------------------------------|--------|-------------------------------------------|----------------------------------|
| heading (h3)                     | string | `/impl-plan` (sets), user may edit        | human phase name                 |
| `<!-- id -->`                    | string | `/impl-plan` (derived from heading)        | internal slug for service-layer  |
| `status`                         | enum   | `/impl-build` orchestrator                | pending → in-progress → done | blocked | deferred |
| `context`                        | string | `/impl-plan` (optional)                   | phase-specific briefing          |
| `rules`                          | list   | `/impl-plan` (plan-agent distributes)     | per-phase rules for code-check   |
| `acceptance_criteria`            | list   | `/impl-plan` creates; `/impl-build` fills | testable criteria w/ evidence    |
| `acceptance_criteria[].evidence` | string | `/impl-build` per criterion               | concrete proof — anchored's USP  |

---

## Extension points

| Slot in anchored.yml          | Where it lands in task-file            |
|-------------------------------|----------------------------------------|
| `task.phase.fields: [...]`    | per-phase fields as new `- key: val` lines after core fields |
| `task.fields: [...]` (V0.3+)  | additional frontmatter top-level keys  |
| `task.status.add: [...]` (V0.3+) | extends task `status` enum (additive) |
| `task.phase.status.add: [...]` (V0.3+) | extends phase `status` enum (additive) |
| `task.sections.add: [...]` (V0.3+) | custom body sections (position-controlled) |

### Round-trip guarantee

The service-layer reads, mutates, and re-renders task-files without
losing any declared extension content. A `commit:` line in a phase
block, once `task.phase.fields` declares it, survives every mutation
cycle untouched unless explicitly modified through service-layer
field ops.

---

## Open conventions (codified)

- **Phase-status enum:** `pending | in-progress | done | blocked | deferred`. Phase-level status is orthogonal to task-level status.
- **`acceptance_criteria`** is fully spelled out (no `ac` abbreviation). Self-documenting, matches "evidence per criterion" pattern.
- **Refinement Q&A:** `Q: <text>\n  → resolved: <answer>` or `→ deferred: <reason>`. Non-Q decisions as plain bullets in `### Plan`.
- **HTML-comment slug:** `<!-- id: ... -->` (not inline bullet). Users see phase NAMES; slugs are for service-layer addressing only.
- **H4 sub-sections under `### Build` named after the writing agent.** Default: `#### Implement`, `#### task-check`, `#### code-check`. User custom agents get their own name.
- **Per-phase entry format under H4:** `- <slug> / <Human Phase Name>` as bullet header, content as indented sub-content.
- **task-check + code-check write at least one verdict line per phase processed** (even `pass` with no findings). Implement only writes when there's a real mid-flight note.
- **Per-phase `rules:` set by plan-agent.** Plan-agent matches rules-summary entries to phases based on scope. Code-check reads per-phase rules during build.
- **Resume-after-crash is automatic.** Implement agent reads task-file first, skips done ACs, continues with rest.
- **Explicit reset is opt-in.** Clear evidences + set phase status to pending in the file directly. Anchored treats it as fresh.
- **task-check runs on blocked phases too.** Verifies partial evidence honesty; phase stays blocked regardless of verdict.
- **Wrap section is hybrid:** free-prose TL;DR + optional `#### review` sub-section.
