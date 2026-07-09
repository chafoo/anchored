---
name: run
description: "Execute a task under the anchored verify loop — anchor the goal into .claude/anchored/<slug>.yml (plan verbatim, criteria setup-tagged, gates sized to the rigor), work as always, spawn ONE independent validator per gate in the background, drive the fix-list, and close only when every criterion is done-with-evidence. Triggers ONLY on the explicit `/a:run <setup>? <description-or-slug>` command (an existing slug resumes its run). Use for `/a:run`, not for general \"run the app\" requests."
---

# /a:run — one task, one run file, evidence-gated

You are the working session AND the orchestrator. The one thing you never do: author
evidence. Only the spawned validator calls `anchored evidence` / `anchored fail` — that
role separation is what makes a checked-off criterion mean *proven*, not *claimed*.

All run-file access goes through the `anchored` CLI over Bash (JSON envelopes; see
[references/api.md](../../references/api.md)). Never Write/Edit a live run file directly —
that would bypass the evidence invariant and the atomic writes.

## Communication style

Plain, short, outcome-first. Say what was proven, what failed and why, what happens next.
No ceremony, no re-narrating the loop.

## Pre-flight

1. `anchored version` — if `command not found`, the plugin isn't enabled or `bin/anchored`
   is missing (dev checkout: `npm --prefix core run bundle:plugin`). Never `npm i -g`.
2. If the argument matches an existing slug (`anchored status` lists them), RESUME: read
   `anchored status <slug>` and continue at the open/failed criteria below.
3. Read `anchored.yml` (if present) for the declared setups and their instructions. No
   file = defaults; that's fine. If the project has never used anchored, offer `/a:setup`
   once — don't push it.

## Anchor

One breath, no planning ceremony. From the user's words + whatever plan already exists:

- **Plan**: if a plan-mode plan was just accepted, or a spec/ticket/chat plan is in
  context, copy it VERBATIM into `plan` — it is the immutable record of what was asked.
  No plan source → omit `plan`, the goal carries the run.
- **Rigor**: from the user's own words — "keep it simple" → `light`, default `standard`,
  "must be clean / important" → `high`, "release-critical" → `max`. The choice is visible
  in the file and correctable.
- **Criteria**: testable derivations of the plan — phrased so a validator can later prove
  or refute each one. Tag each criterion with the setup that knows how to verify it
  (a `/a:run frontend …` argument is a tagging hint, not a field); no fitting setup →
  leave it untagged (defaults).
- **Judgment**: phrase criteria so something CAN be run against them — an execution is the
  sharpest proof, whatever the subject (a test, a render, a request, a checksum). Where the
  subject genuinely has nothing to execute (the copy reads calm, the asset matches the
  brand sheet, the solution follows the pattern), mark `judgment: true`. It is a note to
  the reader, not an escape hatch: "looks right in the browser" is not judgment — drive the
  browser. A validator can never award itself that mark.
- **Gates**: slice them yourself, sized to the rigor (`light`: one final gate ·
  `standard`: by risk · `high`: fine-grained · `max`: one gate per criterion). A gate is
  setup-homogeneous — slice along setup boundaries too.

```bash
anchored anchor fix-navbar <<'EOF'
goal: Navbar overflow on mobile is fixed without changing desktop behavior
plan: |
  <the accepted plan, verbatim>
rigor: standard
criteria:
  - { text: "Navbar items wrap at 375px", setup: frontend, gate: layout }
  - { text: "Desktop pixel-identical", setup: frontend, gate: final }
  - { text: "Follows the layout-component pattern", setup: frontend, gate: final, judgment: true }
EOF
```

## Mirror

Create one session task per criterion, subject `[<slug>/<cN>] <text>` (the name IS the
link — it self-heals across resumes). Check a task off ONLY when its criterion is
done-with-evidence (`anchored status <slug>` after each validation). Pure display: no
task tools available (headless/CI) → skip silently, nothing else changes.

## Work

Implement exactly as you always would. At meaningful moments, one-line trail entries:

```bash
anchored claim fix-navbar "replaced fixed widths with flex layout components" --refs c1,c2
```

Claims are annotation, never gates — don't force one per criterion.

## Gate → validator

When the work behind a gate label is complete:

1. Follow the gate's setup's `before.instructions` (you execute them — e.g. "run
   `bun run typecheck`, red = failed gate"; if they produce a snapshot ref, pass it on).
2. `anchored validate <slug> --gate <g> [--snapshot <ref>]` → the validation packet.
3. Spawn **one** `a:validator` subagent, in the background, handing it the packet
   verbatim (slug, gate, snapshot, rigor, criteria, validator instructions, fields).
   Keep working on other gates meanwhile — the run file is the shared state.

One validator per gate, no more: that's the whole token budget of the loop.

Gates run concurrently against ONE working tree, so tell each validator in its prompt:
scratch files go in its own scratchpad and are run by absolute path — a probe written
under the project's source would be swept into a sibling gate's test run.

## Fix-list, amend, checkboxes

- After a validator finishes, `anchored status <slug>`: flip mirrored checkboxes for
  fresh `done` criteria; `failed` criteria (their `evidence.verdict` is the reason) are
  your fix-list — fix, then re-validate that gate.
- **Course change** (the plan turns out wrong): never edit the plan — amend:

```bash
anchored amend fix-navbar <<'EOF'
reason: .nav-actions is shared with the footer — extract a token instead
add: [{ text: ".nav-actions width from a shared token", setup: frontend, gate: layout-2 }]
supersede: [{ id: c2, by: 1 }]
EOF
```

  Update the mirror (new task for the added criterion; superseded one checked off with a
  note). A genuine goal change is not an amendment — surface it to the user.

## Close

`anchored close <slug>`. `CloseBlocked` → the suggestions ARE the remaining fix-list.
On green: follow the `after.instructions` of the involved setups/defaults (commit +
`anchored set <slug> <cN> commit=<sha>`, PR, … — whatever the user wired; anchored has no
git built-ins). Then report in plain words: goal, N/N criteria proven, **how many rest on
a reasoned verdict rather than an execution** (`anchored status` counts them as `judged` —
say it plainly, it is what the user needs to know before trusting a green run), amendments,
where the trail lives.

## Failure handling — never silent

Exit 2 = a typed refusal: read `error.kind` + `suggestions` and act (they are written to
be followed). Exit 3 = `WriteContention`: re-read (`anchored status`) and retry once.
A validator that dies → re-validate the gate. Anything unresolvable → tell the user what
was proven so far and what blocks; the run file keeps the state, resuming is free.
