# Ticket: dogfood-fixings-4 — version-control provenance + persistence + CLI verbs

**Source:** 3-agent analysis of the v0.1.13 run (§3 process friction). App + process
ran cleanly, no bugs — this is friction at the seam between lifecycle
and Git, not a defect. Four points belong together (they all revolve around "who
fills the version-control truth and where it lives"), point 5 is optional/lowest priority.

## Problem (four interrelated friction points)

**1. `commit_sha` points at the wrong anchor.** The per-phase-filled
`commit_sha` field currently points at the commit in the **phase branch**, which is
**deleted** again during the task wrap merge (`--no-ff`) → the stored SHA is
dead/untraceable after the merge. Clarify semantics: either point at the **merge commit** on
`develop` (survives) or rename it to an "intermediate, fine in the audit" field
(`phase_commit` or similar) and additionally keep a task-level `merge_commit`.

**2. version-control provenance is manual instead of engine-filled.** The commit/branch/merge
steps run today as user `run:` steps in the anchored.yml — the SHA only lands
in the field if the step dutifully writes it back via `set-field`. That is error-prone
(F1 was hit by exactly this once). Consider: an **engine-near, optional
version-control-provenance mechanism** that captures the merge/commit SHA deterministically and
writes it — policy stays (commit strategy is user config), but the **writing-back
of the provenance** should not be hand-wired every time. Draw the boundary to
[[fractal-substrate-integrity]] (mechanism vs. policy) cleanly: WHAT gets committed
= policy; THAT the resulting SHA reliably reaches the field = may be mechanism.

**3. Task-file-state commit policy.** The evidence trail (the task file itself, with
all ACs/evidence/log) is **not co-committed** during the run — the phase commits touch
only the source. Meaning: the most valuable audit artifact (the `_task`/`_epic` file) lives
uncommitted in the working tree until someone commits it manually. Set the policy: do we commit
the task-file state per phase along with it (in the same commit or separately), and if so —
as a default-template step or as mechanism?

**4. CLI verbs `archive` / `reset`.** After every dogfood the anchored-test repo had to be
**manually** reset (branches deleted, task files gone, develop/main
rolled back). A clean CLI verb pair is missing: `anchored archive <slug>` (freeze/clean
away a run) and `anchored reset <slug>` (task file + associated branches
back to initial state). Saves the error-prone manual work and makes dogfood/CI
reproducible.

## Observation from the transcript (own finding)
The auto-slug was **again worked around via rm + recreate** during the run instead of via
`--slug`. The plan SKILL should pass the same slug through **explicitly via `--slug`** on
re-plan, instead of deleting the file and re-scaffolding it (otherwise it loses history/
provenance). Small fix, but it belongs here thematically (provenance loss).

## Optional / lowest priority
**5. plan-decompose enforcement ACs up front.** The enforcement topics (trim/
whitespace, TDZ-free selector scoping, etc.) could be emitted as
explicit acceptance criteria already at decompose time, instead of only surfacing during the build. Nice-to-have,
non-blocking — keep it separate, do not couple it with 1–4.

## Affected
- `core/` — `commit_sha` semantics / possibly new `merge_commit` field; optional
  version-control-provenance mechanism (mechanism side, behind `run` seam); CLI verbs
  `archive` + `reset` (cli/commands/).
- `anchored.default.yml` / example-yml — task-file-state commit step (policy side).
- `plan/SKILL.md` — re-plan passes `--slug` through, no rm+recreate.

## Acceptance
- a1: `commit_sha` (or its successor) points after the task wrap at a
  **surviving** commit; semantics documented.
- a2: The version-control provenance lands **reliably** in the field, without each user step
  having to wire the write-back correctly itself; mechanism-vs-policy boundary
  documented.
- a3: Task-file-state commit policy is decided + wired (default-template
  or mechanism), the audit trail is committed after a run.
- a4: `anchored archive <slug>` + `anchored reset <slug>` exist, tested, make
  the manual repo reset unnecessary.
- a5: Re-plan uses `--slug` instead of rm+recreate (no provenance loss).
- a6 (optional): plan-decompose can emit enforcement ACs up front.
