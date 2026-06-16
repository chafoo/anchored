# Reference: Workflow fan-out — the worktree merge-back is the orchestrator's join

> Scope: the `/a:build` skill whenever it fans a loop step out via the **Workflow
> tool** with **worktree isolation**. Read together with the build SKILL's "Fan-out"
> + "Parallel batches" sections. This file fixes ONE thing the dogfood surfaced: who
> reunites the isolated branches, and how cleanly.

## The gap this closes

A parallel fan-out runs each ready unit as a background Workflow agent. When two
units may write the **same file region**, they run with `isolation: 'worktree'` —
each gets its own git worktree on its own branch, so their writes never collide. That
is correct and stays.

But an isolated worktree **cannot merge itself back**: the integration branch
(`epic/<slug>`, or the task branch for a phase fan-out) is checked out in the **main
tree**, so a unit's own wrap `squash-merge` step — which would merge it back when the
unit runs sequentially in the main tree — has no valid target from inside its
worktree. The branches therefore sit finished-but-stranded until someone in the main
tree reunites them. **That someone is the orchestrator (the main `/a:build`
session), at the synchronization join.** Never the background unit.

## Two senses of "join" — keep them apart

- **Branch merge-back — KEPT, orchestrator-owned.** Bring each isolated unit's
  *clean branch* back onto the current branch with a real `git merge`. This is a
  normal merge of a coherent branch, not hand-work. It happens at the join, in the
  main tree, **serially** (see below).
- **Diff-consolidation — DROPPED, never.** Reading N unit diffs and hand-rewriting
  file contents criterion-by-criterion is the per-criterion-worktree failure mode
  that was removed wholesale. The orchestrator does **not** do this. A branch
  merge-back is `git merge`, not a manual diff splice.

When a unit runs **sequentially in the main tree** (no isolation), its own wrap step
does the merge-back and the orchestrator does nothing extra. The rule below applies
**only** to the isolated-worktree fan-out path.

## The merge-back contract (at the fan-out join)

After the ready batch has built and each unit reached its terminal, the orchestrator
reunites them — one unit at a time:

1. **Serial, never concurrent.** Two merges onto the same integration branch cannot
   run in parallel. Merge unit branches back **one at a time**, each onto the current
   branch, in a deterministic order (e.g. the `depends_on` / ready order).
2. **Use the configured merge — git stays the user's.** The actual git command is the
   one the project's `anchored.yml` declares (the task's wrap `squash-merge` step, the
   epic's `merge-to-main` step, …). The orchestrator **runs that configured merge from
   the main tree** against each unit branch; it does not invent a topology. If the
   project configured **no** merge policy, still reunite the branches with a plain
   merge-back so the work is not stranded — and say so in one line, because you are
   making a git move the config did not spell out.
3. **Conflicts are expected on shared files — resolve, don't re-derive.** Two units
   that touched the same file (e.g. both edited `style.css`) will conflict on the
   second merge. You have **both finished sides in full view** at the join — resolve
   the conflict from the two real versions (keep both intents; reconcile shared
   anchors). Never reconstruct a file from scratch or drop one side silently.
4. **Gates run over the MERGED result, once.** The authoritative evidence-gates
   (`build-task-validate` / `build-code-validate`) run after the merge-back, over what
   actually landed on the integration branch — not over any single worktree in
   isolation. A merge can introduce a regression no isolated unit could see.
5. **Clean up on success.** After a unit's branch is merged and green, delete the
   merged branch and remove its worktree, so the workspace shows only live work.
6. **Surface what you did.** Report the merge-backs and any conflict you resolved in
   plain words — the merge-back is real integration work the user should see on the
   record, not silent plumbing.

## Tiers

- **epic → tasks** (the common case): each ready task built in its own worktree on
  `task/<flattened-slug>`; the orchestrator squash-merges each back onto
  `epic/<slug>` serially at the join.
- **task → phases**: phases of one task usually touch the same files, so they build
  **sequentially in the main tree** (no isolation, no merge-back). Only when phases
  are genuinely file-disjoint do they fan out — and only then, if isolated, does this
  same merge-back contract apply onto the task branch.

## Fallbacks

- **No `Workflow` tool available** → run the batch sequentially in the main tree.
  Each unit's own wrap merge-back then works directly; this whole file is moot.
- **No worktree isolation needed** (units provably write disjoint files) → they may
  fan out in the main tree without branches; again no orchestrator merge-back.

The discipline here is **orchestration policy**, not engine mechanism: the engine
never runs git, and the merge commands themselves live in the user's `anchored.yml`.
This file only says *who* drives them across isolated branches, *when*, and *how
cleanly*.
