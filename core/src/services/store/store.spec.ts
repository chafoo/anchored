import { test, expect } from 'bun:test'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { z } from 'zod'
import { createStore, type StoreDeps } from './store.js'
import type { AnchoredError } from '../../lib/utils/error.js'

const Schema = z.strictObject({
  slug: z.string(),
  status: z.string(),
  title: z.string().optional(),
})

// a fake filesystem: a content map + a version that bumps on every write (mtime+size proxy).
function fakeFs() {
  const files = new Map<string, string>()
  const ver = new Map<string, number>()
  return {
    files,
    bump: (path: string) => ver.set(path, (ver.get(path) ?? 0) + 1), // simulate a concurrent write
    fs: {
      readFile: async (p: string) => {
        const c = files.get(p)
        if (c === undefined) throw new Error('ENOENT')
        return c
      },
      writeFile: async (p: string, d: string) => {
        files.set(p, d)
        ver.set(p, (ver.get(p) ?? 0) + 1)
      },
      rename: async (a: string, b: string) => {
        files.set(b, files.get(a)!)
        files.delete(a)
        ver.set(b, (ver.get(b) ?? 0) + 1)
      },
      unlink: async (p: string) => void files.delete(p),
      mkdir: async () => undefined,
      stat: async (p: string) => (files.has(p) ? String(ver.get(p) ?? 0) : undefined),
    },
  }
}

function makeStore(over: Partial<StoreDeps> = {}) {
  const h = fakeFs()
  const deps: StoreDeps = {
    fs: h.fs,
    lock: { acquire: async () => async () => {} },
    yaml: { parse: (raw, o) => yamlParse(raw, o), stringify: (v, o) => yamlStringify(v, o) },
    pathFor: (slug) => `/tasks/${slug}.yml`,
    archivePathFor: (slug) => ({ from: `/tasks/${slug}.yml`, to: `/tasks/_archive/${slug}.yml` }),
    rand: () => 'r',
    pid: () => 1,
    ...over,
  }
  return { store: createStore(deps), h }
}

// a1 — write then read round-trips through real yaml + the given schema
test('write → read round-trips a node', async () => {
  const { store } = makeStore()
  await store.write('t', { slug: 't', status: 'plan', title: 'T' }, Schema)
  expect(await store.read('t', Schema)).toMatchObject({ slug: 't', status: 'plan', title: 'T' })
})

// a2 — the schema is the law: an invalid node never reaches disk
test('write rejects a node the schema refuses (fail-closed)', async () => {
  const { store, h } = makeStore()
  await expect(store.write('t', { slug: 't' } as never, Schema)).rejects.toThrow() // missing status
  expect(h.files.has('/tasks/t.yml')).toBe(false)
})

// a3 — compare-and-swap: a concurrent write since read → WriteContention, no clobber
test('write rejects when the file changed since read (CAS)', async () => {
  const { store, h } = makeStore()
  await store.write('t', { slug: 't', status: 'plan' }, Schema)
  const node = await store.read('t', Schema) // stamps the read-time version
  h.bump('/tasks/t.yml') // a concurrent writer lands
  let err: unknown
  try {
    await store.write('t', { ...node, status: 'drafted' }, Schema)
  } catch (e) {
    err = e
  }
  expect((err as AnchoredError).kind).toBe('WriteContention')
})

// a4 — archive moves the file per the INJECTED archivePathFor {from→to}; remove deletes it
test('archive relocates per injected from→to, remove deletes', async () => {
  const { store, h } = makeStore()
  await store.write('t', { slug: 't', status: 'plan' }, Schema)
  await store.archive('t')
  expect(h.files.has('/tasks/t.yml')).toBe(false)
  expect(h.files.has('/tasks/_archive/t.yml')).toBe(true)

  await store.write('u', { slug: 'u', status: 'plan' }, Schema)
  await store.remove('u')
  expect(h.files.has('/tasks/u.yml')).toBe(false)
})
