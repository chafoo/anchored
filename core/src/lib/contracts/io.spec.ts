import { test, expect } from 'bun:test'
import type { Io } from './io.js'

// contracts/io is interface-only — tsc is its real gate. This conformance spec
// pins the surface: a minimal in-memory Io must satisfy the port and its verbs
// must be callable with the documented signatures (drift in the interface breaks
// this `satisfies`).
test('a1 — an in-memory Io conforms to the port and its verbs work', async () => {
  const files = new Map<string, string>()
  const io: Io = {
    atomicWrite: async (path, content) => void files.set(path, content),
    readFile: async (path) => {
      const c = files.get(path)
      if (c === undefined) throw new Error('ENOENT')
      return c
    },
    move: async (from, to) => {
      files.set(to, files.get(from)!)
      files.delete(from)
    },
    remove: async (path) => void files.delete(path),
    statVersion: async (path) => (files.has(path) ? '1' : undefined),
  } satisfies Io

  await io.atomicWrite('/a.yml', 'x', undefined)
  expect(await io.readFile('/a.yml')).toBe('x')
  expect(await io.statVersion!('/a.yml')).toBe('1')
  await io.move('/a.yml', '/b.yml')
  expect(await io.readFile('/b.yml')).toBe('x')
  await io.remove('/b.yml')
  expect(await io.statVersion!('/b.yml')).toBeUndefined()
})
