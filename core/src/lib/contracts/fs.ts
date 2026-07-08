// lib/contracts/fs.ts — the effect seams the store is built on (bin provides, store
// consumes). Interface-only. `fs` is THE one effect; `lock` + `yaml` ride alongside it as
// the store's injected dependencies. The real node:fs / proper-lockfile / yaml live in
// bin.ts and are injected into createStore.

export interface FileSystem {
  readFile(path: string): Promise<string>
  writeFile(path: string, data: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  mkdir(dir: string, opts: { recursive: true }): Promise<unknown>
  readdir(dir: string): Promise<string[]>
  /** A cheap version token (mtime+size) for compare-and-swap; optional (disables CAS). */
  stat?(path: string): Promise<string | undefined>
}

export interface Lock {
  /** Acquire an exclusive cross-process lock for `path`; resolves to a release fn. */
  acquire(path: string): Promise<() => Promise<void>>
}

export interface Yaml {
  parse(raw: string, opts?: { maxAliasCount?: number }): unknown
  stringify(value: unknown, opts?: { lineWidth?: number }): string
}
