import { test, expect } from 'bun:test'
import type { FileSystem, Lock, Yaml } from './fs.js'

// conformance: an in-memory FileSystem + Lock + Yaml satisfy the seams and work.
test('the effect seams conform and operate', async () => {
  const files = new Map<string, string>()
  const fs: FileSystem = {
    readFile: async (p) => {
      const c = files.get(p)
      if (c === undefined) throw new Error('ENOENT')
      return c
    },
    writeFile: async (p, d) => void files.set(p, d),
    rename: async (a, b) => {
      files.set(b, files.get(a)!)
      files.delete(a)
    },
    unlink: async (p) => void files.delete(p),
    mkdir: async () => undefined,
    readdir: async () => [...files.keys()],
    stat: async (p) => (files.has(p) ? '1' : undefined),
  }
  const lock: Lock = { acquire: async () => async () => {} }
  const yaml: Yaml = { parse: () => ({ a: 1 }), stringify: () => 'a: 1\n' }

  await fs.writeFile('/t.tmp', 'x')
  await fs.rename('/t.tmp', '/t.yml')
  expect(await fs.readFile('/t.yml')).toBe('x')
  expect(await fs.readdir('/')).toContain('/t.yml')
  expect(await fs.stat!('/t.yml')).toBe('1')
  const release = await lock.acquire('/t.yml')
  await release()
  expect(yaml.parse('a: 1')).toEqual({ a: 1 })
  expect(yaml.stringify({ a: 1 })).toContain('a: 1')
})
