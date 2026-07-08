// services/store/scope/safe-write.ts — the atomic-write dance, store-internal. The ONE
// dangerous part of the store: mkdir → cross-process lock → compare-and-swap → temp write →
// atomic rename → release. `expectedVersion` is the file's version at READ time; a mismatch
// under the lock means a concurrent writer landed (parallel background validators) → reject
// loudly instead of clobbering. fs/lock/rand/pid are injected (no node:fs here beyond path).
import { dirname } from 'node:path'
import { anchoredError } from '../../../lib/utils/error.js'
import type { FileSystem, Lock } from '../../../lib/contracts/fs.js'

export interface SafeWriteDeps {
  fs: FileSystem
  lock: Lock
  rand: () => string
  pid: () => number
}

export async function safeWrite(
  deps: SafeWriteDeps,
  path: string,
  content: string,
  expectedVersion?: string,
): Promise<void> {
  const { fs, lock, rand, pid } = deps
  await fs.mkdir(dirname(path), { recursive: true })
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
    if (expectedVersion !== undefined && fs.stat) {
      const current = await fs.stat(path)
      if (current !== undefined && current !== expectedVersion) {
        throw anchoredError(
          'WriteContention',
          `${path} changed since it was read (concurrent write) — no write performed`,
          ['re-read the run and retry the mutation on the fresh state'],
        )
      }
    }
    const tmp = `${path}.tmp.${String(pid())}.${rand()}`
    await fs.writeFile(tmp, content)
    await fs.rename(tmp, path)
  } finally {
    await release()
  }
}
