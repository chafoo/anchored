/**
 * Atomic file IO for the v2 factory ops.
 *
 * Every op writes through `atomicWrite`. The function combines three
 * layers of safety:
 *
 *   1. **Cross-process lock** (proper-lockfile). Acquires `<path>.lock`
 *      as a `mkdir`-based lock directory. Two anchored processes
 *      writing the same task-file serialize here — the second waits up
 *      to ~400ms (3 retries × 100ms backoff) before throwing
 *      `WriteContention`. Stale locks (>10s old, prior process
 *      crashed) auto-reclaim on the next acquire attempt.
 *
 *   2. **Atomic rename** (POSIX guarantee). Write to a per-pid +
 *      random-suffix temp sibling, then `fs.rename(tmp, path)`. Rename
 *      is atomic on POSIX filesystems — a crash mid-write leaves the
 *      original file intact, never a half-written task-file. Readers
 *      see either the old or new file.
 *
 *   3. **Parent mkdir -p**. The lock acquisition needs the parent
 *      directory to exist (since the lock IS a sub-directory of it).
 *      We mkdir the parent before attempting the lock; on first-write
 *      (initial `task.create`), this is what makes the lock work.
 *
 * The lock is always released — `finally` runs even on write failure.
 */

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import lockfile from 'proper-lockfile';

import { WriteContention } from './errors.js';

/**
 * Retry budget for lock acquisition. 3 retries × 100ms = ~400ms
 * worst case. This is intentionally short — anchored writes are
 * <50ms each, so a healthy contending writer should release well
 * within the budget. If we hit the cap, something abnormal is
 * happening (a stuck process, a frozen NFS volume, etc.) — better
 * to surface fast than to hang the orchestrator.
 */
const LOCK_RETRY_OPTIONS = {
  retries: 3,
  minTimeout: 100,
  maxTimeout: 100,
} as const;

/**
 * Stale-lock auto-reclaim threshold. If a lockfile's mtime hasn't
 * been refreshed in this many ms, the next acquirer treats it as
 * abandoned (crashed process) and steals it. proper-lockfile
 * refreshes the mtime every `stale/2` ms while the lock is held,
 * so a live writer is well-protected against false reclaim.
 */
const STALE_THRESHOLD_MS = 10_000;

/**
 * Write `content` to `path` atomically, holding a cross-process
 * lock on the path for the duration of the write.
 *
 * Steps:
 *   1. `mkdir -p` the parent directory (lock acquisition needs it).
 *   2. Acquire `<path>.lock` via proper-lockfile (retries up to 3×).
 *   3. Write to `<path>.tmp.<pid>.<random>`.
 *   4. `rename(tmp, path)` — atomic on POSIX.
 *   5. Release the lock (always, even on write failure).
 *
 * Crashes between steps 3 and 4 leave the temp file behind (a stale
 * sibling) but never corrupt `path`. The temp file is small (a
 * single YAML doc) and gets cleaned up organically on the next
 * successful write to the same target (rename overwrites are
 * atomic too).
 *
 * If the lock cannot be acquired within the retry budget, throws
 * `WriteContention` — the caller's recovery options depend on
 * context (orchestrator may retry the whole op; CLI surfaces the
 * error to the user).
 */
export async function atomicWrite(path: string, content: string): Promise<void> {
  // Step 1: ensure parent exists. The lock directory is a sibling
  // of the target file (proper-lockfile creates `<path>.lock` via
  // mkdir), so the parent must exist before we acquire.
  await mkdir(dirname(path), { recursive: true });

  // Step 2: acquire the cross-process lock. `realpath: false` is
  // load-bearing here — the default `true` calls `fs.realpath` on
  // `path` and fails with ENOENT for first-time writes (e.g. the
  // initial `task.create` before the file exists on disk).
  let release: () => Promise<void>;
  try {
    release = await lockfile.lock(path, {
      retries: LOCK_RETRY_OPTIONS,
      stale: STALE_THRESHOLD_MS,
      realpath: false,
    });
  } catch (err) {
    throw new WriteContention(
      `failed to acquire write-lock on ${path}: ${(err as Error).message}`,
      [
        'Another anchored process is holding the lock on this task-file. Wait for it to finish, or stop the other process before retrying.',
        'If you suspect a stale lock from a crashed process, delete the `.lock` directory next to the task-file manually (proper-lockfile auto-reclaims after 10s of inactivity, so manual cleanup is rarely needed).',
        'For predictable behavior, use one git worktree per active task — see plugin/references/state-mutations.md "Concurrency model".',
      ],
    );
  }

  // Step 3-4: write to temp, rename onto target. The lock guarantees
  // no concurrent process is doing the same dance against `path`.
  try {
    const suffix = `${process.pid}.${randomBytes(6).toString('hex')}`;
    const tmp = `${path}.tmp.${suffix}`;
    await writeFile(tmp, content, 'utf-8');
    await rename(tmp, path);
  } finally {
    // Step 5: always release. If the write threw, we still must
    // surrender the lock — otherwise the next attempt sees a live
    // (but un-owned) lock and either waits the full budget or
    // steals on stale-reclaim, depending on timing.
    await release();
  }
}
