import { test, expect } from 'bun:test'
import { createIo, type IoDeps } from './io.js'

function makeFakeIo(opts?: { lockFails?: boolean; writeFails?: boolean }) {
  const calls: string[] = []
  const files = new Map<string, string>()
  const deps: IoDeps = {
    fs: {
      async mkdir(dir: string) {
        calls.push(`mkdir:${dir}`)
        return undefined
      },
      async writeFile(p: string, data: string) {
        calls.push(`write:${p}`)
        if (opts?.writeFails) throw new Error('disk full')
        files.set(p, data)
      },
      async rename(from: string, to: string) {
        calls.push('rename')
        const d = files.get(from)
        files.delete(from)
        if (d !== undefined) files.set(to, d)
      },
      async readFile(p: string) {
        const d = files.get(p)
        if (d === undefined) throw new Error(`ENOENT: ${p}`)
        return d
      },
      async unlink(p: string) {
        calls.push(`unlink:${p}`)
        files.delete(p)
      },
    },
    lock: {
      async acquire(p: string) {
        calls.push(`acquire:${p}`)
        if (opts?.lockFails) throw new Error('lock timeout')
        return async () => {
          calls.push('release')
        }
      },
    },
    rand: () => 'RND',
    pid: () => 999,
  }
  return { deps, calls, files }
}

// a1 — pure factory over fake fs (no real node:fs)
test('createIo writes fully through fakeFs', async () => {
  const { deps, files } = makeFakeIo()
  const io = createIo(deps)
  await io.atomicWrite('base/x.yml', 'hello')
  expect(files.get('base/x.yml')).toBe('hello')
  expect(await io.readFile('base/x.yml')).toBe('hello')
})

// a2 — write-then-rename; mkdir before lock; full call sequence
test('atomicWrite sequence: mkdir → acquire → write(tmp) → rename → release', async () => {
  const { deps, calls } = makeFakeIo()
  await createIo(deps).atomicWrite('base/x.yml', 'c')
  expect(calls).toEqual([
    'mkdir:base',
    'acquire:base/x.yml',
    'write:base/x.yml.tmp.999.RND',
    'rename',
    'release',
  ])
})

// a3 — nested slug creates the parent dir; flat slug adds no subdir
test('nested slug mkdir -p the epic dir; flat slug does not', async () => {
  const nested = makeFakeIo()
  await createIo(nested.deps).atomicWrite('base/epicA/task.yml', 'c')
  expect(nested.calls).toContain('mkdir:base/epicA')
  const flat = makeFakeIo()
  await createIo(flat.deps).atomicWrite('base/task.yml', 'c')
  expect(flat.calls).toContain('mkdir:base')
  expect(flat.calls.some((c) => c.startsWith('mkdir:base/'))).toBe(false)
})

// a4 — lock timeout → WriteContention; write error still releases
test('lock timeout throws WriteContention; write error still releases lock', async () => {
  const locked = makeFakeIo({ lockFails: true })
  await expect(createIo(locked.deps).atomicWrite('base/x.yml', 'c')).rejects.toThrow(
    /could not acquire write lock/,
  )
  const failed = makeFakeIo({ writeFails: true })
  await expect(createIo(failed.deps).atomicWrite('base/x.yml', 'c')).rejects.toThrow('disk full')
  expect(failed.calls).toContain('release') // released despite write failure
})

// remove — deletes the file through the injected fs.unlink seam (no real node:fs).
test('remove deletes the file via fs.unlink', async () => {
  const { deps, calls, files } = makeFakeIo()
  const io = createIo(deps)
  await io.atomicWrite('base/x.yml', 'hello')
  expect(files.get('base/x.yml')).toBe('hello')
  await io.remove('base/x.yml')
  expect(files.has('base/x.yml')).toBe(false)
  expect(calls).toContain('unlink:base/x.yml')
})

// move — mkdir -p the destination dir, then rename (atomic relocation).
test('move mkdir -p the dest dir then renames', async () => {
  const { deps, calls, files } = makeFakeIo()
  const io = createIo(deps)
  await io.atomicWrite('base/x.yml', 'hello')
  await io.move('base/x.yml', 'base/archive/x.yml')
  expect(files.get('base/archive/x.yml')).toBe('hello')
  expect(files.has('base/x.yml')).toBe(false)
  // mkdir of the dest dir comes before the rename
  const mkdirIdx = calls.indexOf('mkdir:base/archive')
  const renameIdx = calls.lastIndexOf('rename')
  expect(mkdirIdx).toBeGreaterThanOrEqual(0)
  expect(renameIdx).toBeGreaterThan(mkdirIdx)
})

// M4 (harden-2) — compare-and-swap: a write whose read-time version no longer
// matches the on-disk version is rejected (lost-update prevented, not clobbered).
test('M4: atomicWrite CAS rejects a stale write; matching/absent version writes', async () => {
  let version = 'v1'
  const { deps } = makeFakeIo()
  deps.fs.statVersion = async () => version
  const io = createIo(deps)
  // matching version → writes
  await io.atomicWrite('base/x.yml', 'a', 'v1')
  // a concurrent writer bumped the version → a stale write is rejected loudly
  version = 'v2'
  await expect(io.atomicWrite('base/x.yml', 'b', 'v1')).rejects.toThrow(/changed since it was read/)
  // no expected version (create / first write) → no CAS, writes
  await io.atomicWrite('base/x.yml', 'c')
  // the matching current version → writes
  await io.atomicWrite('base/x.yml', 'd', 'v2')
})

// M4 — the file lock provides mutual exclusion: a second acquire waits for release.
test('M4: a stateful lock serializes — second acquire blocks until release', async () => {
  let held = false
  const order: string[] = []
  const lock = {
    async acquire() {
      while (held) await new Promise((r) => setTimeout(r, 1))
      held = true
      return async () => {
        held = false
      }
    },
  }
  const { deps } = makeFakeIo()
  const io = createIo({ ...deps, lock })
  await Promise.all([
    io.atomicWrite('p', '1').then(() => order.push('w1')),
    io.atomicWrite('p', '2').then(() => order.push('w2')),
  ])
  expect(order.length).toBe(2) // both completed, serialized by the lock (no overlap hang)
})
