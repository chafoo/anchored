// contracts/io.ts — the single IO seam. The ONLY effect in the whole engine routes
// through this port: atomic write (mkdir → lock → temp → rename → CAS), reads, and
// whole-file moves/removes (archive/reset). Interface-only — the real fs/lock/rand/pid
// live in bin.ts and are injected into createIo, which implements this surface.
export interface Io {
  /** Atomic write behind a cross-process lock + compare-and-swap. `expectedVersion`
   *  is the file's version when the caller read it; a mismatch (concurrent writer in
   *  the parallel epic fan-out) rejects loudly instead of clobbering. */
  atomicWrite(path: string, content: string, expectedVersion?: string): Promise<void>
  /** Raw read of a task-file (existence + content); the codec turns it into a node. */
  readFile(path: string): Promise<string>
  /** Move a file as a unit (archive: relocate into archive/). No content mutation. */
  move(oldPath: string, newPath: string): Promise<void>
  /** Delete a file as a unit (reset: back to before the task existed). */
  remove(path: string): Promise<void>
  /** Cheap version token (mtime+size) for compare-and-swap; undefined disables CAS. */
  statVersion?(path: string): Promise<string | undefined>
}
