---
slug: skill-orchestration
status: draft
created: 2026-05-25
---

# Skill orchestration — how /impl-* skills compose

How the four `/impl-*` slash commands are wired as Claude Code skills:
the agent inventory anchored ships, which agents are framework-fixed vs.
user-configurable, the folder layout, what each SKILL.md actually
contains, and how MCP enforces task-file discipline.

---

## Agent inventory

Anchored ships 5 subagents + delegates to 1 Claude Code built-in. Three
are user-customizable (default-suggested), two are framework-fixed
(always run, user can extend but not replace).

| Agent           | Source              | Used in       | Framework-fixed? | Why                                          |
|-----------------|---------------------|---------------|------------------|----------------------------------------------|
| `Explore`       | Claude Code built-in| `/impl-plan`  | no               | generic code-discovery — reuse the built-in  |
| `rules`         | anchored-shipped    | `/impl-plan`  | no               | scans rule files; user can swap if they have own conventions tooling |
| `plan`          | anchored-shipped    | `/impl-plan`  | no               | writes task-file in anchored's schema; user can replace if they want different format (rare) |
| `implement`     | anchored-shipped    | `/impl-build` | no               | per-phase implementation worker (methodology-agnostic); user often replaces with custom agent for their stack |
| **`task-check`**| anchored-shipped    | `/impl-build` | **yes**          | enforces "no AC done without honest evidence" — the anchored USP. Can't be disabled. |
| **`code-check`**| anchored-shipped    | `/impl-build` | **yes**          | enforces must-follow rules adherence. Can't be disabled. |

**Fixed agents are anchored's quality gate.** Without them, "anchored" is
just markdown task-files. The two checks make the USP enforceable, not
optional.

**User can EXTEND fixed agents** via anchored.yml — prose in the same-name
key gets appended to the agent's default instructions. See "Extension
pattern for fixed agents" below.

**User can REPLACE non-fixed agents** by writing different prose:
"spawn my-custom-implementer instead of the default implement agent".
The AI reads, complies.

---

## Folder layout

```
anchored/
├── skills/                              ← Claude Code loads these
│   ├── impl-plan/
│   │   └── SKILL.md                     ← orchestrator manual
│   ├── impl-build/
│   │   └── SKILL.md
│   ├── impl-wrap/
│   │   └── SKILL.md
│   └── impl/                            ← autopilot (V0.3+, ships later)
│       └── SKILL.md
├── agents/                              ← shared across all skills
│   ├── rules.md
│   ├── plan.md
│   ├── implement.md
│   ├── task-check.md                    ← FIXED — framework quality gate
│   └── code-check.md                    ← FIXED — framework quality gate
├── src/                                 ← service-layer + frontends
│   ├── schema/                          ← parses anchored.yml
│   ├── parser/                          ← task-file ↔ data structure
│   ├── ops/
│   │   ├── core.ts                      ← typed core ops
│   │   └── field.ts                     ← generic field ops (schema-driven)
│   ├── cli/                             ← `anchored` binary
│   └── mcp/                             ← MCP server exposing ops as tools
└── references/                          ← loaded on-demand by skills/agents
    ├── task-file-schema.md
    ├── anchored-yml-defaults.md
    └── ...
```

**Why agents at top-level (not under each skill):** they're shared and
reusable. `plan` and `rules` are only used by /impl-plan today, but if
/impl-wrap ever wants rules-scanning, no move needed. Matches how
Claude Code's built-in agents work — central registry.

---

## SKILL.md pattern (identical shape per skill)

Each SKILL.md has the same 5-section structure:

```markdown
---
name: impl-<phase>
description: |
  <push-enough description for explicit triggering>
---

# /impl-<phase>

<2-3 sentences: what this skill does, when to invoke>

## Pre-flight

Load anchored.yml from project root (use built-in defaults if missing).
Load .claude/tasks/<slug>.md (figure slug from user prompt or recent context).
Refuse to run if task.status ≠ "<expected>".

## Pipeline

For each step declared in anchored.yml.<phase> (in file order):
- Read step prose
- Execute (spawn agents mentioned in prose, run shell, call service-layer ops)

## Framework defaults (always run)

<bulleted list — mirrors the `default:` comment in anchored.yml>

## Wrap-up

Validate task-file schema.
Transition task status to <next>.
Return summary to user.
```

**The orchestrator IS Claude (main instance) reading SKILL.md.** No
separate "runner" process. Claude reads → executes → mutates via MCP.

---

## Concrete: /impl-build SKILL.md

```markdown
---
name: impl-build
description: |
  Execute the implementation phase of an anchored task. Iterates through
  pending phases, runs your implement + task-check + code-check pipeline
  per phase, transitions task to wrap when complete. Use only after
  /impl-plan has produced a refined task-file (status: build).
---

# /impl-build

Runs the per-phase build loop for an anchored task. Reads the task-file,
iterates pending phases, applies user pipeline + framework quality gates,
commits state via MCP ops.

## Pre-flight

1. Load anchored.yml from project root. If missing, use built-in defaults
   (see references/anchored-yml-defaults.md).
2. Find the task-file at .claude/tasks/<slug>.md. Slug from user prompt
   or recent context.
3. Call mcp__anchored__task_status_get(slug). Refuse with helpful
   message if status ≠ "build".

## Pipeline loop

While there's a pending phase:

1. phase = mcp__anchored__phase_next_pending(slug)
   - exit loop if null
2. mcp__anchored__phase_status_set(slug, phase.slug, "in-progress")
3. For each step in anchored.yml.build (declaration order):
   a) Read step prose
   b) Execute it — may spawn agents mentioned in prose, run shell, or
      call service-layer ops
4. **Framework-fixed:** spawn task-check agent (always runs).
   If user has anchored.yml.build.task_check prose → append to agent
   instructions as additional requirements.
5. **Framework-fixed:** spawn code-check agent (always runs).
   Same extension pattern via anchored.yml.build.code_check prose.
6. Evaluate:
   - all checks return verdict: pass?
   - mcp__anchored__ac_list(slug, phase.slug) → all evidence non-empty?
   - if both yes → mcp__anchored__phase_status_set(slug, phase.slug, "done")
   - else → mcp__anchored__phase_status_set(slug, phase.slug, "blocked")
     + mcp__anchored__context_append(slug, "build", "<one-line blocker note>")

## Wrap-up

- Validate task-file schema via mcp__anchored__task_read(slug)
- mcp__anchored__task_status_set(slug, "wrap")
- Return summary: phases done / blocked / deferred, total ACs satisfied

## References on demand

- references/task-file-schema.md — for ac/evidence field formats
- references/anchored-yml-defaults.md — for default behavior reference
```

**This is the full SKILL.md.** ~60 lines. /impl-plan and /impl-wrap
mirror this shape, simpler bodies because no loop.

---

## Extension pattern for fixed agents

Fixed agents (`task-check`, `code-check`) always run. To extend their
behavior, user adds same-name prose key to anchored.yml — the prose is
**appended** to the agent's default instructions:

```yaml
build:
  implement: |
    Read the phase carefully. For each acceptance criterion, implement
    the code that satisfies it and capture concrete evidence. Replace
    with your methodology if you have one (TDD, BDD, code-first, etc.).
  
  # Same-name key extends the fixed task-check agent's instructions
  task_check: |
    Beyond default checks, also verify that metadata fields declared in
    task.phase.fields are preserved on the phase block.
  
  # Same-name key extends the fixed code-check agent's instructions
  code_check: |
    Beyond default checks, flag any new console.log calls as warn-severity
    findings.
```

If user omits `task_check:` or `code_check:` keys — agents run with
just their default instructions. Always run, never disabled.

**Extension prose is APPENDED, not replacing.** Default agent prompt
defines the core check criteria; user prose adds project-specific
requirements on top.

---

## MCP enforcement mechanism

The MCP server is the **mandatory** path for task-file mutations.
Agents and skill orchestrators call MCP tools; the server validates
+ mutates atomically.

### What MCP enforces

| Enforcement                          | How                                              |
|--------------------------------------|--------------------------------------------------|
| Schema validity                      | Parser rejects malformed mutations               |
| Lifecycle legality                   | `task.status.set` refuses illegal transitions    |
| Phase status transition rules        | `phase.transition(from, to)` validates legal moves |
| Field-type correctness               | Generic ops validate against anchored.yml types  |
| Acceptance-criterion evidence shape  | `ac.evidence.set` validates index in range, value non-empty if signaling done |
| Round-trip preservation              | Render preserves unknown fields verbatim          |

### Agent discipline

Anchored-shipped agents are prompted to:

- **NEVER** call `Write` or `Edit` directly on task-file paths
- **ALWAYS** call `mcp__anchored__*` tools for task-file mutations
- Use `Read` on task-files only for inspection (not editing)
- Mutations on non-task-file files (the actual implementation code)
  use normal `Write`/`Edit` freely

This is **prompt-enforced**, not tool-restricted in V0.2. We could
later restrict `Write` tool to certain paths via Claude Code's
permission system if discipline drift becomes a problem.

---

## How users add custom agents

Two paths:

### Path 1: Reference any discoverable agent in prose

```yaml
build:
  implement: |
    Spawn my-implementation-specialist agent with the phase context.
    The agent returns structured evidence per AC; capture each via
    mcp__anchored__ac_evidence_set.
```

User's agent must exist in either:
- `.claude/agents/<name>.md` (project-local)
- `~/.claude/agents/<name>.md` (user-global)
- A loaded plugin's `agents/` folder

Anchored doesn't manage discovery — Claude Code does.

### Path 2: Replace an anchored-shipped agent for a single skill

User defines `.claude/agents/my-plan.md`, then:

```yaml
plan:
  refine: |
    Spawn my-plan agent (overrides the default anchored plan agent).
    Pass it the explore findings and rules summary. The agent must
    produce a task-file matching the anchored schema (see
    references/task-file-schema.md).
```

**Caveat:** if user replaces anchored's `plan` agent, they're
responsible for matching the task-file schema. Framework still
validates output and refuses to transition if invalid.

Fixed agents (`task-check`, `code-check`) cannot be replaced —
only extended. See above.

---

## Slash-command triggering

Per [skill-naming.md](./skill-naming.md), all four commands are
**explicit-only** — Claude Code does not auto-trigger from natural
language. User must type `/impl-plan`, `/impl-build`, etc.

This is enforced by writing descriptions that are clear about purpose
but don't fish for triggers. Example description for /impl-build:

```
description: |
  Execute the implementation phase of an anchored task. Iterates 
  through pending phases. Use only after /impl-plan completes and 
  task status is `build`.
```

No "build X", "implement Y" phrases that might match user's casual
"build this feature" prompts. The user must explicitly invoke.

---

## Open — to settle before V0.2 ships

1. **Built-in defaults shipping format** — anchored.yml defaults
   currently live as commented YAML in references/. Should they be
   compiled into skill orchestrators (single source of truth in
   SKILL.md), or stay in references/ as the canonical source?
   V0.2 vote: references/ canonical, orchestrator loads from there.

2. **Agent prompt evolution** — when we update an anchored-shipped
   agent's behavior, how do user extensions stay safe? Likely the
   extension prose just appends, so framework changes don't break
   user customization unless the agent's contract changes.

3. **Tool restriction for discipline** — V0.2 relies on prompt
   discipline ("never Write task-file directly"). If drift happens,
   move to Claude Code permission-based restrictions in V0.3+.

4. **Wrap subagent?** — /impl-wrap currently has no subagent (main
   instance writes summary directly). If summary quality varies a lot
   between runs, a dedicated `wrap` agent might help. V0.2 decision:
   no agent, see how it goes.

## References

- [skill-naming.md](./skill-naming.md) — `/impl-*` command family
- [task-file-schema-spec.md](./task-file-schema-spec.md) — task-file core schema
- [service-layer-architecture.md](./service-layer-architecture.md) — typed ops + generic ops
- [anchored-yml-defaults.md](./anchored-yml-defaults.md) — pipeline structure + framework defaults
