---
slug: skill-naming
status: decided
created: 2026-05-25
---

# Skill Naming — `/impl` family

## Decision

The anchored skill-pack ships **four slash-commands** that form a single
naming family around the `impl` prefix:

| Slash command | Lifecycle phase | Role |
|---|---|---|
| `/impl-plan`  | pre-implement   | Refinement — raw plan → refined task-file |
| `/impl-build` | main implement  | Implementation loop — per-phase work (methodology user-defined) |
| `/impl-wrap`  | post-implement  | Wrap-up — finalize, summary, mark task done |
| `/impl`       | autopilot       | Runs plan → build → wrap sequentially |

**All commands are explicit-only.** No description-based auto-triggering.
The user must type the command. This is a deliberate design choice — we
never want anchored to silently start mutating a task-file because Claude
thought it heard "let's plan this".

## Why this naming

- **Family clustering** — the `impl-` prefix groups all four commands
  visually in slash-command lists, makes the relationship between phases
  immediately legible.
- **Short enough to type, descriptive enough to read** — `/impl-plan` is
  four keystrokes more than `/i-plan` but communicates the purpose without
  requiring prior knowledge.
- **Future-proof for public release** — when anchored ships to the broader
  Claude Code dev community, new users can guess what `/impl-*` does without
  reading docs. `/i-*` would have required onboarding overhead.
- **Lifecycle clarity** — `plan` / `build` / `wrap` map cleanly to the three
  phases users intuitively recognize (planning, building, finishing).

## Considered alternatives

- `/i-*` family (rejected — too cryptic for non-power-users)
- `/refine`, `/implement`, `/wrap-up` (rejected — no shared prefix, doesn't
  signal they're one family/product)
- `/implement {start|exec|end}` as single skill with args (rejected —
  description-matching weakens when one skill covers three triggers)
- `/anchored-*` (rejected — too long, repetitive)

## Implications for the rest of the project

- **Config:** one shared `anchored.yml` with three top-level sections that
  match phase names: `plan:`, `build:`, `wrap:`. Same step-anatomy in each.
- **Task-file as backbone:** all four commands read and mutate the same
  `.claude/tasks/<slug>.md`. Skills are stateless; state lives in the file.
- **Service-layer / MCP / CLI:** state-mutation interface is shared across
  all four skills. Same ops, called from different skill orchestrators.
- **Folder layout (planned):**
  ```
  skills/
  ├── impl-plan/
  │   └── SKILL.md
  ├── impl-build/
  │   └── SKILL.md
  ├── impl-wrap/
  │   └── SKILL.md
  └── impl/
      └── SKILL.md     ← thin autopilot wrapping the other three
  agents/              ← shared subagents across skills
  ├── plan.md
  ├── rules.md
  ├── implement.md
  ├── task-check.md
  └── code-check.md
  ```

## What this ticket does NOT decide

Only the slash-command names. Still open:

- `anchored.yml` final shape and merge semantics (separate discussion)
- Built-in step names inside each skill (e.g. is the `plan` step in
  `impl-plan` literally called `plan`? Most likely yes, but pending)
- Whether `/impl` autopilot prompts between phases or runs straight through
- Naming for shared `agents/` files (likely unchanged: `plan.md`,
  `rules.md`, etc.)
- Migration: the existing `skills/refine/` work needs to be renamed to
  `skills/impl-plan/` and the SKILL.md / description / examples updated.
