# Ticket: Harden-3 — Trust → Enforcement: gate agent + captured exit code + context threads (L)

**STATUS: DONE ✅** (254 tests green) — L1a `add-phase-evidence --run` (exit code
via code, only exit-0 → evidence, otherwise loud GateFailed), L1b build-gate agent +
build-implement guidance, L2 by composition (M2 blocks phase-done without a green
--run acceptance criterion), concern surface HARD in the substrate: `add-concern`/`resolve-concern`,
`setStatus→done` rejects with `ConcernsOpen` as long as any are open; wrap concern walk (same
walk-style as refine: only important / all / all-AI) resolves them. "Nothing stays
open, but concerns can be clarified" — proven live + by test.


**Source:** hardening review + design conversation. Slimmed down from the first
version: instead of two heavyweights (gate verb + structured evidence system) →
**ONE** gate/verify agent + **one** small capturing CLI verb. "Better something than
too little", but with a real deterministic foundation.

## Design decision (recorded)
**The exit code goes via code, not via the agent.** An agent that itself
claims "exit 0" would just be the validator renamed. Instead the agent runs
its runs through a **capturing CLI** that actually executes the command, captures `code` +
`stdout` (`run-step.ts` can already do this) and only accepts evidence on **exit-0**.
**Rule: only on exit 0 → acceptance criterion done. On failure → note in context +
decide how to proceed (never silent, never auto-done).**

## L1 + L3 (merged) — gate/verify agent + capturing verb

### L1a — capturing evidence verb (deterministic foundation, S–M)
`anchored node add-phase-evidence <slug> <phase> <ac> --run "<cmd>"`: runs `<cmd>`
through the run seam, writes structured evidence `{command, exit_code, output}`,
**accepts the acceptance criterion only on exit-0**. Prose evidence remains allowed (for
cases not command-verifiable: browser behavior, design), but distinguishable in the data model
(reproducible vs. claimed). The exit code is captured by code,
not claimed by the agent.

### L1b — gate/verify agent (the flexible part, AI)
An agent that:
- gets **instructions + command(s)** (config-driven, like a custom step;
  this is where the project gate commands test/lint/typecheck land),
- runs its runs **through the capturing verb (L1a)** → deterministic exit-0 foundation,
- **interprets evidence + problems** (the qualitative judgement sensibly stays AI),
- writes everything into the **context** — result summary + every unexpected point as
  an open thread (see context section).

**On failure (exit ≠ 0):** the agent notes the failure in the context (open thread),
the acceptance criterion does NOT become done; human/AI decides how to proceed (fix, defer, accept
with justification). Never wave it through silently.

## L2 — phase-done coupled to a green record (M)
`setChildStatus(phase, done)` requires: (a) all acceptance criteria done-with-evidence AND (b) wherever a
gate command is defined, a **green captured record** (exit-0). Otherwise
`GateNotRun`/`GateFailed`. Builds on L1a + Harden-2/M2 (acceptance-criterion completion). After that
the orchestrator can no longer set the phase done before green gates.

## Context "open threads" — bringing back the v1 `task.context` strength (S–M)
In v1 `task.context` held everything + had a "still needs to be discussed"
section. v2 lacks that as a deliberate surface. Add it:
- A running **"open threads / check at the end" list**: gate agent + every worker
  appends unexpected points — `anchored node append-log <slug> <stage> concern
  "<what needs to be checked at the end>"` (`log[]` + `kind` exists; we need the
  convention `kind: concern` + a view over it).
- **Wrap/roll-up checks the open threads** and holds completion as long as any are
  open/unaddressed. Deterministic half: not "the AI remembers",
  but "the substrate shows the open points, done blocks until addressed".
- Catches exactly the unexpected gate/run failures in a structured way, instead of getting lost in the prose
  trail.

## Order / dependency
Harden-1 → Harden-2 → Harden-3. L2 needs L1a + Harden-2/M2. The context-thread
mechanism can come early (cheap) and is used by L1b.
