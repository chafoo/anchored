// store/io/io.ts — createIo(deps): atomic-write substrate. mkdir -p → lock → write temp →
// POSIX rename → release (finally). fs/lock/rand/pid are injected seams; the
// write logic touches no node:fs directly (fakeable in tests). node:path is a
// pure utility (no effect), so importing dirname is fine.
import { dirname } from 'node:path'
import { anchoredError } from '../../../domain/invariants/invariants.js'

export interface IoFs {
  mkdir(dir: string, opts: { recursive: true }): Promise<unknown>
  writeFile(path: string, data: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  readFile(path: string): Promise<string>
  /** Delete a file. Used by remove() (task reset) — behind the same injected seam. */
  unlink(path: string): Promise<void>
  /** A cheap version token of the file (mtime+size), used for compare-and-swap.
   *  Optional: a fake fs without it simply disables CAS (single-writer tests). */
  statVersion?(path: string): Promise<string | undefined>
}
export interface IoLock {
  /** Acquire an exclusive lock for `path`; resolves to a release function. */
  acquire(path: string): Promise<() => Promise<void>>
}
export interface IoDeps {
  fs: IoFs
  lock: IoLock
  rand: () => string
  pid: () => number
}

export function createIo(deps: IoDeps) {
  const { fs, lock, rand, pid } = deps
  return {
    // M4 (harden-2): atomic write behind a real cross-process lock PLUS a
    // compare-and-swap. `expectedVersion` is the file's version at the moment the
    // caller READ it; if the on-disk file changed since (a concurrent writer in the
    // parallel epic fan-out), we REJECT loudly (WriteContention) instead of clobbering
    // its update — the caller re-reads + retries. Lock alone can't prevent this:
    // temp+rename is already atomic, so the hazard is a stale read-modify-write, and
    // CAS is what catches it.
    async atomicWrite(path: string, content: string, expectedVersion?: string): Promise<void> {
      // 1. parent dir lazily (nested <epic>/<slug>); a flat slug adds no subdir.
      await fs.mkdir(dirname(path), { recursive: true })
      // 2. cross-process lock
      let release: () => Promise<void>
      try {
        release = await lock.acquire(path)
      } catch (e) {
        throw anchoredError(
          'WriteContention',
          `could not acquire write lock for ${path}: ${(e as Error).message}`,
          ['another process holds the lock — retry shortly'],
        )
      }
      try {
        // 3. CAS — under the lock, the current on-disk version must still equal the
        //    version the caller read from. A mismatch = a concurrent write landed.
        if (expectedVersion !== undefined && fs.statVersion) {
          const current = await fs.statVersion(path)
          if (current !== undefined && current !== expectedVersion) {
            throw anchoredError(
              'WriteContention',
              `${path} changed since it was read (concurrent write) — no write performed`,
              ['re-read the node and retry the mutation on the fresh state'],
            )
          }
        }
        // 4. write temp sibling, then atomic rename.
        const tmp = `${path}.tmp.${String(pid())}.${rand()}`
        await fs.writeFile(tmp, content)
        await fs.rename(tmp, path)
      } finally {
        // 5. always release.
        await release()
      }
    },
    async readFile(path: string): Promise<string> {
      return fs.readFile(path)
    },
    // remove — delete a file outright (task reset: back to before it existed). Small,
    // behind the injected fs seam (no node:fs here) so it stays fakeable.
    async remove(path: string): Promise<void> {
      await fs.unlink(path)
    },
    // move — relocate a file (task archive: freeze it out of the active set). mkdir -p
    // the destination dir first (the archive/ subdir may not exist), then atomic rename.
    async move(from: string, to: string): Promise<void> {
      await fs.mkdir(dirname(to), { recursive: true })
      await fs.rename(from, to)
    },
    async statVersion(path: string): Promise<string | undefined> {
      return fs.statVersion ? fs.statVersion(path) : undefined
    },
  }
}
