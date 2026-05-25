---
slug: default-agents
status: draft
created: 2026-05-25
---

# Default agents — overview

High-level reference for every agent anchored ships as part of V0.2.
Captures each agent's input/job/output, tools needed, what they write
to the task-file, and replaceable-vs-fixed status. Use this as the
design contract when writing the actual agent prompts.

For pipeline-level details (when agents are spawned, how their outputs
flow), see [skill-orchestration.md](./skill-orchestration.md).
For task-file structure they read/write into, see
[task-file-schema-spec.md](./task-file-schema-spec.md).

---

## Inventory

| # | Agent           | Used in       | Tools                                | Replaceable?         |
|---|-----------------|---------------|--------------------------------------|----------------------|
| 1 | `Explore`       | `/impl-plan`  | Read, Glob, Grep (built-in)          | yes                  |
| 2 | `rules`         | `/impl-plan`  | Read, Glob, Grep                     | yes                  |
| 3 | `plan`          | `/impl-plan`  | Read + MCP ops (no direct task-file Write) | yes            |
| 4 | `implement`     | `/impl-build` | Read, Write, Edit, Bash + MCP ops    | yes                  |
| 5 | `task-check`    | `/impl-build` | Read, Glob, Grep, Bash + MCP ops     | **NO — extend only** |
| 6 | `code-check`    | `/impl-build` | Read, Glob, Grep, Bash + MCP ops     | **NO — extend only** |

Plus built-in skill (not an agent, listed for completeness):

| Skill     | Used in        | Role                                          |
|-----------|----------------|-----------------------------------------------|
| `/review` | `/impl-wrap`   | final code-review pass over the task diff     |

---

## Per-agent design contract

### 1. `Explore` (Claude Code built-in)

| Property | Value |
|---|---|
| Input    | raw user plan + task context |
| Job      | • glob/grep codebase for relevant patterns<br>• identify affected paths, similar existing code, existing abstractions<br>• return condensed summary (not file dumps) |
| Output   | discovery summary: `{ affected_paths, similar_code, patterns }` |
| Writes to task-file? | **no** — read-only |
| Notes    | We delegate entirely to Claude Code's built-in. No anchored-shipped prompt for this agent. Configuration limited to whatever the built-in accepts. |

### 2. `rules` (anchored-shipped)

| Property | Value |
|---|---|
| Input    | raw plan + discovery summary (affected_paths, patterns) + user-configured rule paths from `anchored.yml.plan.rules` |
| Job      | • scan `.claude/rules/` + any user-configured paths<br>• filter rules by relevance to **overall task scope** (path-match, keyword-match)<br>• categorize: `must_follow` vs `worth_knowing`<br>• cap at 30 must_follow entries (prioritize ruthlessly) |
| Output   | `{ must_follow: [{rule, path, why}], worth_knowing: [{rule, path}], sources: [...] }` |
| Writes to task-file? | **no** — read-only filter agent. Output passed to `plan` agent which distributes per-phase. |
| Notes    | Operates at task-level (returns rules relevant to the whole task). `plan`-agent then maps each rule to specific phases based on phase scope. Empty rule folders → return empty result + note (don't error). Never invents rules — every output entry must point to a real file. |

### 3. `plan` (anchored-shipped)

| Property | Value |
|---|---|
| Input    | raw plan + discovery summary + rules summary (from `rules`-agent) + `anchored.yml.plan.*` |
| Job      | • synthesize Context block (3–8 sentences: why / what exists / what's missing)<br>• decompose into 2–6 named phases (Title Case + kebab-case slug)<br>• write 2–6 testable acceptance_criteria per phase<br>• apply `ac_defaults` from anchored.yml to every phase<br>• **distribute rules-summary across phases** — for each phase, set per-phase `rules:` list with rules whose path/scope matches that phase's work (each entry has `path` + `why-for-this-phase`)<br>• surface gaps as `[blocking]` Qs in ### Plan<br>• never guess answers — open questions stay open |
| Output   | task-file written via MCP; structured return summary `{ task_file_path, phases, ac_total, open_questions }` |
| Writes to task-file? | **yes** — the only agent allowed to write the full file at creation. Always via service-layer ops (never direct Write/Edit). |
| Writes to | • frontmatter (slug, status=plan, created)<br>• `# <Title>` heading<br>• `## Context` body<br>• `### Plan` (decisions + Q&A + open Qs)<br>• `## Phases` with full phase blocks: status=pending, evidence=`—`, per-phase `rules:` list, per-phase `context:` (optional) |
| Notes    | Status stays `plan` after agent finishes — orchestrator transitions to `build` after Q&A loop completes successfully. Per-phase rules distribution is the agent's call — base it on which files/patterns each phase is likely to touch. If a rule applies to multiple phases, include it on all of them with phase-specific `why`. |

### 4. `implement` (anchored-shipped)

| Property | Value |
|---|---|
| Input    | one phase (slug + name + acceptance_criteria + context + per-phase rules from task-file) + `anchored.yml.build.implement` instructions |
| Job      | • **read the task-file first** to check current state of acceptance_criteria evidences (resume-safe — skip ACs already done)<br>• read the phase carefully — context, acceptance_criteria, per-phase rules, decisions from ### Plan<br>• for each AC with empty evidence: implement the code that satisfies it<br>• capture concrete evidence per AC (file:line + one-liner / command + outcome / demonstrable result)<br>• document mid-flight decisions or pivots to ### Build → #### Implement (only when noteworthy)<br>• mark phase blocked if any AC is unsatisfiable |
| Output   | `{ phase_done: bool, evidences_set: int, touched_files: [...], blockers: [...] }` |
| Writes to task-file? | **yes** — via MCP only, never direct Write/Edit |
| Writes to | • `phase.acceptance_criteria[].evidence` per AC (via `ac.evidence.set`)<br>• `### Build → #### Implement` per-phase notes (via `context.append`)<br>• `phase.status` if blocking (via `phase.status.set`) |
| Notes    | **Methodology-agnostic by default.** No TDD/BDD/etc. baked in — user pins methodology via `anchored.yml.build.implement` instructions.<br>**Idempotent / resume-safe.** Always reads task-file first to know which ACs already have evidence. Skips done ACs, continues with pending. Sb-bot lesson: if user wants to RESTART from scratch, they clear evidences manually and set status=pending in the task-file. File = single source of truth; anchored treats that as a fresh phase.<br>**Touched-files tracking.** Implement returns the list of files it created/modified during the phase. Code-check uses this list (combined with per-phase rules) to know exactly what to scan against what.<br>Implementation code (the actual src/ files) uses normal Write/Edit freely; only task-file mutations go through MCP. |

### 5. `task-check` (anchored-shipped, FIXED)

| Property | Value |
|---|---|
| Input    | just-processed phase + its acceptance_criteria + the evidence strings now filled (or partially filled if phase ended up blocked) |
| Job      | • verify every AC has non-empty, honest evidence<br>• for each evidence: file:line refs point to real lines; commands referenced were plausibly run; test names resolve to actual tests<br>• categorize findings by severity: `block` (cannot mark phase done), `warn` (proceed with note), `info` (FYI)<br>• verdict at the end: `pass` / `warn` / `fail` |
| Output   | `{ verdict, findings: [{severity, ac_index, reason}], slug, phase_name }` |
| Writes to task-file? | **yes** — verdict + findings via MCP |
| Writes to | • `### Build → #### task-check` per-phase entry: header `<slug> / <Phase Name>` + verdict line + findings (if any) |
| Notes    | **FIXED — always runs after implement step.** User prose in `anchored.yml.build.task_check` is APPENDED to default instructions; cannot replace or disable. Anchored's USP enforcement #1 ("no AC done without honest evidence"). Writes at least a one-line verdict per phase processed — keeps audit trail complete even when nothing's wrong.<br>**Runs on blocked phases too.** When implement marks a phase blocked (some ACs unsatisfiable), task-check still verifies the partial evidences that ARE present. Verdict reflects partial work quality (typically `warn` for blocked phases with honest partials). Phase stays blocked; check just adds honest audit info. |

### 6. `code-check` (anchored-shipped, FIXED)

| Property | Value |
|---|---|
| Input    | `touched_files: [...]` from implement-output + per-phase `rules:` list from task-file (set during /impl-plan by plan-agent distributing rules-agent output) |
| Job      | • read the per-phase `rules:` list (each entry: `path` + `why`)<br>• for each rule: read the rule file content<br>• scan the `touched_files` for violations against that rule<br>• flag each violation with location + severity + which rule<br>• categorize by severity: `block` / `warn` / `info`<br>• verdict at the end: `pass` / `warn` / `fail` |
| Output   | `{ verdict, findings: [{severity, file, line, rule, reason}], slug, phase_name }` |
| Writes to task-file? | **yes** — verdict + findings via MCP |
| Writes to | • `### Build → #### code-check` per-phase entry: header `<slug> / <Phase Name>` + verdict line + findings (if any) |
| Notes    | **FIXED — always runs after implement step.** Same extension semantic as task-check. Anchored's USP enforcement #2 (rule-adherence). Same audit-trail rule: at least one verdict line per phase processed.<br>**Scope is precise.** Doesn't scan the whole working copy or git diff — only the `touched_files` implement reported, against the rules specifically assigned to this phase. Avoids false-positives from pre-existing violations or unrelated code. |

---

## Where each agent writes in the task-file

```
## Context
  ### Plan
    ← plan (decisions + Q&A trace + open questions, task-level)
  ### Build
    #### Implement
      ← implement (per-phase notes/decisions, on-demand)
    #### task-check
      ← task-check (per-phase verdict + findings, always at least 1 line)
    #### code-check
      ← code-check (per-phase verdict + findings, always at least 1 line)
    #### <custom-agent>
      ← user's custom/replacement agent (if any)
  ### Wrap
    ← summarize step (free-prose TL;DR, task-level)
    #### review
      ← wrap.review step (default: /review findings, on-demand)

## Phases
  ### <Phase Name>
    - status:           ← orchestrator (plan creates as `pending`, build mutates)
    - rules:            ← plan-agent (distributes from rules-agent output, per-phase)
    - acceptance_criteria[].evidence
                        ← implement (fills per AC during execution)
```

All writes go through MCP service-layer ops — no agent uses raw Write/Edit
on the task-file path. Service-layer validates each mutation against the
schema before persisting.

---

## Design priority for V0.2

Ordered by what's blocking what:

1. **`plan` first** — defines the task-file shape every other agent reads.
   If plan is wrong, everything downstream is wrong. Largest agent
   (~350–400 lines of prompt).

2. **`task-check` + `code-check` in parallel** — anchored's two USP-gates.
   Critical for trust in the system. Medium-sized agents (~250–300 lines
   each). Implement is designed against task-check's "honest evidence"
   contract, so these need to settle first.

3. **`implement`** — the workhorse. Designed after task-check so its
   evidence-capture semantics match what task-check verifies. Large
   prompt (~300–400 lines) because of the per-AC loop + service-layer
   integration + agent-discipline rules.

4. **`rules`** — smallest and best-understood (have V0.1 draft).
   Mostly portable. ~200–250 lines. Can ship last without blocking
   the others.

Total prompt code for V0.2 agents: roughly **1,400–1,700 lines**.

---

## What's NOT an agent (but might be confused for one)

- `/review` — Claude Code built-in **skill**, not an agent. Invoked
  via prose in `wrap.review` step. Anchored doesn't ship a wrap-agent
  in V0.2; the summarize step is executed by the main Claude instance
  directly.

- `Explore` — Claude Code built-in **agent**, but anchored doesn't
  ship a prompt for it. We delegate fully.

- The `/impl-*` skill orchestrators (SKILL.md files) — these are
  skill manuals, not agents. They read anchored.yml, spawn agents in
  order, call MCP ops for state transitions. The main Claude instance
  executes them; no separate "orchestrator agent".

---

## Settled (decided during V0.2 design)

- **Rules persistence:** per-phase `rules:` field set by plan-agent;
  consumed by code-check. (Not a task-level section.)
- **Phase-diff scope for code-check:** uses `touched_files` from
  implement output, scoped to per-phase `rules:`. Precise attribution.
- **Resume-after-crash:** implement is idempotent — reads task-file
  first, skips ACs with evidence, continues with the rest. User restarts
  manually via clearing evidences + setting status pending.
- **task-check on blocked phases:** runs, verifies partial evidences.
- **`implement` commit boundary:** never — commits are user's call via
  optional pipeline step.
- **Plan agent's `[blocking]` handling:** writes Q with `→ ?`; orchestrator
  loops Q&A until resolved before flipping status to `build`.

## Open — still TBD when designing actual prompts

1. **Evidence-honesty heuristics for task-check** — how aggressive should
   it be? "test name resolves" requires running the test or just grep'ing
   for it? V0.2 vote: grep-level check (cheap, catches obvious lies);
   V0.3 could add actual command replay.

2. **Findings format under `#### task-check` / `#### code-check`** —
   structured (key: value) or free-prose? V0.2 vote: structured one-liners
   for findings + freeform 1-liner for verdict, as shown in
   task-file-schema-spec.md.

3. **Plan agent's per-phase rule distribution heuristic** — how does it
   decide which rules apply to which phase? V0.2 vote: based on the
   phase's likely-affected files (from phase context + AC content) matched
   against rule scope (paths the rule applies to, keywords in rule body).
   Same heuristic as rules-agent uses task-level, just applied per-phase.

## References

- [task-file-schema-spec.md](./task-file-schema-spec.md) — task-file shape
- [skill-orchestration.md](./skill-orchestration.md) — when agents are spawned
- [anchored-yml-defaults.md](./anchored-yml-defaults.md) — default pipelines
- [anchored-yml-customs.md](./anchored-yml-customs.md) — override/extend rules
- [service-layer-architecture.md](./service-layer-architecture.md) — MCP ops agents call
