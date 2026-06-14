import { test, expect } from 'bun:test'
import { safeWrite, type SafeWriteDeps } from './safe-write.js'
import type { AnchoredError } from '../../../lib/utils/error.js'

function harness(over: Partial<SafeWriteDeps> = {}) {
  const files = new Map<string, string>()
  const events: string[] = []
  let released = false
  const deps: SafeWriteDeps = {
    fs: {
      readFile: async () => '',
      writeFile: async (p, d) => {
        events.push(`write ${p}`)
        files.set(p, d)
      },
      rename: async (a, b) => {
        events.push(`rename ${a}→${b}`)
        files.set(b, files.get(a)!)
        files.delete(a)
      },
      unlink: async () => undefined,
      mkdir: async () => {
        events.push('mkdir')
        return undefined
      },
      stat: async (p) => (files.has(p) ? 'v1' : undefined),
    },
    lock: {
      acquire: async () => {
        events.push('lock')
        return async () => {
          released = true
          events.push('release')
        }
      },
    },
    rand: () => 'r',
    pid: () => 7,
    ...over,
  }
  return { deps, files, events, wasReleased: () => released }
}

// a1 — mkdir → lock → temp write → atomic rename → release (in order)
test('writes through a temp file + atomic rename under the lock, then releases', async () => {
  const h = harness()
  await safeWrite(h.deps, '/tasks/t.yml', 'body')
  expect(h.events).toEqual([
    'mkdir',
    'lock',
    'write /tasks/t.yml.tmp.7.r',
    'rename /tasks/t.yml.tmp.7.r→/tasks/t.yml',
    'release',
  ])
  expect(h.files.get('/tasks/t.yml')).toBe('body')
})

// a2 — compare-and-swap: a version mismatch rejects loudly (no write), still releases
test('a CAS version mismatch throws WriteContention and still releases the lock', async () => {
  const h = harness()
  h.files.set('/tasks/t.yml', 'old') // file exists → stat returns 'v1'
  let err: unknown
  try {
    await safeWrite(h.deps, '/tasks/t.yml', 'new', 'v0') // expected v0 ≠ current v1
  } catch (e) {
    err = e
  }
  expect((err as AnchoredError).kind).toBe('WriteContention')
  expect(h.files.get('/tasks/t.yml')).toBe('old') // no clobber
  expect(h.wasReleased()).toBe(true)
})

// a3 — a lock acquisition failure surfaces as WriteContention
test('a lock acquire failure is WriteContention', async () => {
  const h = harness({ lock: { acquire: async () => Promise.reject(new Error('held')) } })
  await expect(safeWrite(h.deps, '/tasks/t.yml', 'x')).rejects.toThrow(
    /could not acquire write lock/,
  )
})
