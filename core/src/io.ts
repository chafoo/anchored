// io.ts — createIo(deps): atomic-write substrate. mkdir -p → lock → write temp →
// POSIX rename → release (finally). fs/lock/rand/pid are injected seams; the
// write logic touches no node:fs directly (fakeable in tests). node:path is a
// pure utility (no effect), so importing dirname is fine.
import { dirname } from 'node:path'
import { anchoredError } from './state/invariants.js'

export interface IoFs {
  mkdir(dir: string, opts: { recursive: true }): Promise<unknown>
  writeFile(path: string, data: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  readFile(path: string): Promise<string>
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
    async atomicWrite(path: string, content: string): Promise<void> {
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
      // 3. write temp sibling, then atomic rename; 4. always release.
      const tmp = `${path}.tmp.${String(pid())}.${rand()}`
      try {
        await fs.writeFile(tmp, content)
        await fs.rename(tmp, path)
      } finally {
        await release()
      }
    },
    async readFile(path: string): Promise<string> {
      return fs.readFile(path)
    },
  }
}
