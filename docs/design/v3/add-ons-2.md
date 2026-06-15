# anchored v3 — add-ons 2: keeping the user oriented (the build-escalation policy)

> A second add-on batch, on the UX axis: **help the user work faster without losing
> oversight.** Decided 2026-06-15. Captures the design for a user-defined escalation policy
> that governs the autonomous build. Build on a branch off `v3-add-ons` (or its successor).

## The driving principle

anchored exists to let the user delegate the *how* and keep control of the *what* — without
the feeling of losing the thread. Control is **not** "approve everything"; it is:

1. **be in the loop on the few things that matter** — high-stakes, irreversible, off-intent — and
2. **be able to reconstruct the rest in seconds** (a readable trail, not reading the code).

We already serve this with: a recommendation + implications on every question, the
priority-threshold / `conditions` walk, the build `stop`-conditions, and the audit trail. This
add-on sharpens the **input side** — *when* the AI pulls the user in during the long autonomous
build — into one clean, user-defined policy.

## The decision — a build-escalation policy

**The user freely defines, in their own words, when anchored should pull them in during the
build.** This is the `conditions` mechanism (the topic filter) elevated to a standing policy
for the whole build run.

### When it is asked — in the refine walk, once
- It fires **once**, in the **refine walk** — where the user is already in dialogue with the
  node's questions, so it is **one** interaction point, not two. Fallback: if refine is skipped
  (`drafted → build`), it is asked in the pre-build walk at the start of `/a:build`.
- At the **tier being refined**: refining an **epic** asks it once and it governs the
  **entire epic build**, including every child task — **not** re-asked when the build
  just-in-time refines each child. Refining a **standalone task** asks it there.
- The answer is the standing policy for that run (held in working memory; the user can still
  revise it mid-flight — "actually, also loop me in on X").

### How it is asked — typed prose, NOT a menu
The escalation policy is captured as **free-form prose the user TYPES**, not a pick-list. One
simple question — *"When do you want me to pull you in during the build?"* — with a **suggested
default shown in the prompt**, so the lazy path is "accept the suggestion": e.g. *"Default: just
the important calls. Or type: all of them · none, you decide · or topics like 'anything
touching persistence or auth'."* The old priority presets (`high`/`medium`/`low`/`ai`) survive
only as **example phrasings inside the prompt**, not as selectable options. The AI then judges
each build-time escalation moment against the user's words (the `conditions` mechanism,
generalised).

> **SELECTION vs. PROSE split:** the node's actual **plan questions** (the concrete
> ambiguities) stay **selection-based** (`AskUserQuestion` with options + a recommendation —
> real forks deserve clickable choices). The **escalation policy** ("when else should I reach
> you") is inherently open, so it is **typed prose**. Two kinds of input, two UIs.

## The safety reflex — skill-prose, NOT a coded heuristic

A free-form policy has one gap: the **unknown-unknowns** — the risks the user didn't think to
name. We cover it with the simplest possible thing: a **one-line instruction in the refine +
build skills** — *"surface anything irreversible / high-blast-radius (destroying data,
rewriting history, breaking a contract/schema, …) regardless of the user's stated conditions."*
It rides the AI's normal review at refine and at implementation; there is **no coded
reversibility engine, no heuristic to maintain.** Decided: do **not** over-engineer this.

Honest framing: this is a **best-effort help, not a hard guarantee.** anchored's *hard*
guarantees live in the substrate (evidence, acceptance criteria); "when to interrupt" is, by
design, soft helpful behaviour — we help the user keep oversight, we do not promise to catch
every dangerous thing for them.

## How it relates to what exists — and what it REVISES
- **`conditions`** (the topic filter already in the refine walk) is the vehicle, generalised
  into the build run's standing escalation policy.
- **REVISES the selectable threshold walk** (commits `900de48` / `98fbe83`): the multi-option
  `high/medium/low/ai` + timing picker for the escalation policy becomes the single **typed
  prose** question above (the presets survive only as example phrasings). The node's own plan
  questions stay selection-based.
- **`stop`-conditions** already carry the build's halt rules — the safety-reflex instruction
  lives naturally alongside them.
- **This resolves the earlier "reconciliation":** the refine walk now does two distinct things
  — resolve the node's *known* questions (selection), and capture the *escalation policy* for
  the unknowns that arise during build (prose). No overlap left to untangle.

## Build impact (skill-side, lean)
- **refine SKILL:** the walk gains the **typed-prose** escalation question, asked **once** at
  the refined tier (epic governs its children; standalone task asks there); hold the answer in
  working memory for the run. Replaces the selectable threshold picker (the node's *known*
  questions stay selection-based). Fallback: ask it in the pre-build walk if refine was skipped.
- **build SKILL:** at every escalation moment (a build-time decision, an action about to run),
  judge it against (a) the user's prose policy and (b) the **safety-reflex** instruction —
  escalate (ask the user) on a match, else proceed-and-document with reasoning (`source: ai`).
- **the safety reflex:** a one-line instruction in the refine + build skills, **no code** —
  it sits alongside the existing `stop`-conditions.

## Status — DESIGN (not yet built)
Decided: a **typed-prose** escalation policy, asked **once in the refine walk** (fallback:
pre-build walk), at the refined tier, governing the whole build; the priority presets survive
only as suggested phrasings; the node's own plan questions stay **selection**-based. A **safety
reflex** as a one-line skill instruction (surface the irreversible/dangerous), deliberately
**not** a coded heuristic — best-effort help, not a hard guarantee. When built: revise the
refine walk (commits `900de48` / `98fbe83`) + the build skill to apply the prose policy.
