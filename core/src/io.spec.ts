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
