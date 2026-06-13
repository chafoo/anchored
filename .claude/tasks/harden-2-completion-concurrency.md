# Ticket: Harden-2 — Deterministic completion + real concurrency (M-tier)

**STATUS: DONE ✅** (251 tests green) — M1 kind-aware completion (done|deferred
policy), M2 kind-done requires evidence-backed ACs, M3 epic-acceptance[] evidence
requirement, M4 real file lock (O_EXCL + stale takeover) + compare-and-swap (mtime/size
version travels as a symbol from the read to the write, loudly rejects stale lost
updates instead of silently), M5 mergeRec depth guard (64) + anchored.yml size cap (512KB)
+ maxAliasCount. blocked keeps the parent open, deferred does not.


**Source:** hardening review. This group touches the substrate core (completion
guarantees + write serialization) — needs more tests, but does NOT change the
agent contract. M effort.

## Findings + fix

### M1 — task/epic reaches `done` with pending/blocked children (completability vacuum)
`assertNodeCompletable` (`invariants.ts:51`) checks `node.acceptance_criteria` —
but task/epic have no *own* ACs → `[]` → trivial pass. The only
guard is the forward-only transition, which NEVER looks at the children
(`node-ops.ts:150`). Meaning: an epic can become `done` while a task stub
is still `pending`.
**Fix:** make `setStatus` kind-aware — on `→wrap`/`→done` with `childField`, assert every
child as terminal-successful (epic: every stub `done`; task: every phase
`done`), otherwise a typed `ChildrenIncomplete` error. See chat for implication.

### M2 — child stub/phase reaches `done` with evidence-less own ACs
`setChildStatus`/`setChildField` (`node-ops.ts:430-466`) only validate the
loop-queue enum, but never check that the stub's/phase's own ACs are
evidence-backed — the same gap one tier deeper.
**Fix:** on the flip to the done marker, run an `assertNodeCompletable` equivalent over the
child ACs; denylist child `status` from `setChildField`.

### M3 — epic `acceptance[]` (the contract) without a hard invariant
`setAcceptanceStatus` (`node-ops.ts:236`) flips an epic definition-of-done item to
done without backing; a hallucinating roll-up stamps the whole epic delivered.
**Fix:** extend the hard invariant to epic `acceptance[]` (generalization
of `assertAcDoneHasEvidence`, minimal contract pointer), combined with M1.

### M4 — production write lock is a no-op → lost update
`bin.ts:41` wires `lock: { acquire: async () => async () => {} }` — the
cross-process lock that `io.ts:30-49` is built around is ineffective. Two parallel
`anchored` processes on the same `_epic.yml` (exactly the parallel epic fan-out
model) read-modify-write last-writer-wins, evidence silently lost.
**Fix:** wire a real file lock (O_EXCL/`wx` lockfile with PID + stale takeover, or
`proper-lockfile`) behind the existing `IoLock` seam in `bin.ts`;
plus compare-and-swap (mtime/hash in the lock), since whole-node read-modify-write can
inherently lose even with a lock. Test: stateful fake lock + concurrency scenario.

### M5 — `mergeRec` without depth bound + no SIZE_CAP on anchored.yml
`mergeRec` (`merge.ts:66-83`) has no depth bound; the anchored.yml parse path
(`bin.ts:60`) has no SIZE_CAP/`maxAliasCount` (unlike task files). Hostile/
huge config → stack overflow/blow-up.
**Fix:** depth guard (~64) in `mergeRec`; SIZE_CAP + conservative `maxAliasCount`
on the anchored.yml parse.

## Test debt (parallel)
- `assertNodeCompletable` end-to-end for task/epic.
- Concurrency test with a stateful fake lock (proves serialization).
