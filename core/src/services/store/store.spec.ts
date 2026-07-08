import { describe, test, expect } from 'bun:test'
import { createStore } from './store.js'
import type { FileSystem, Lock, Yaml } from '../../lib/contracts/fs.js'
import type { Schema } from '../../lib/contracts/store.js'

const passSchema: Schema = { parse: (x) => x }

function memFs(versions?: Map<string, string>) {
  const files = new Map<string, string>()
  const fs: FileSystem = {
    readFile: async (p) => {
      const c = files.get(p)
      if (c === undefined) throw new Error(`ENOENT: ${p}`)
      return c
    },
    writeFile: async (p, d) => void files.set(p, d),
    rename: async (a, b) => {
      files.set(b, files.get(a)!)
      files.delete(a)
    },
    unlink: async (p) => void files.delete(p),
    mkdir: async () => undefined,
    readdir: async (dir) => {
      const names = [...files.keys()]
        .filter((p) => p.startsWith(`${dir}/`))
        .map((p) => p.slice(dir.length + 1))
      if (names.length === 0) throw new Error(`ENOENT: ${dir}`)
      return names
    },
    stat: async (p) => versions?.get(p) ?? (files.has(p) ? 'v1' : undefined),
  }
  return { files, fs }
}

const realYaml: Yaml = {
  parse: (raw) => JSON.parse(raw) as unknown, // shape-compatible stand-in for unit isolation
  stringify: (v) => JSON.stringify(v),
}
const openLock: Lock = { acquire: async () => async () => {} }

function makeStore(fs: FileSystem, yaml: Yaml = realYaml) {
  return createStore({
    fs,
    lock: openLock,
    yaml,
    pathFor: (slug) => `/runs/${slug}.yml`,
    runsDir: '/runs',
    rand: () => 'r',
    pid: () => 1,
  })
}

describe('write', () => {
  test('is fail-closed: an invalid node never reaches disk', async () => {
    const { files, fs } = memFs()
    const store = makeStore(fs)
    const reject: Schema = {
      parse: () => {
        throw new Error('invariant violated')
      },
    }
    expect(store.write('r1', { bad: true }, reject)).rejects.toThrow('invariant violated')
    expect(files.size).toBe(0)
  })

  test('persists via temp+rename at pathFor', async () => {
    const { files, fs } = memFs()
    await makeStore(fs).write('r1', { goal: 'g' }, passSchema)
    expect(files.get('/runs/r1.yml')).toBe('{"goal":"g"}')
    expect([...files.keys()].some((p) => p.includes('.tmp.'))).toBe(false)
  })
})

describe('read → write CAS', () => {
  test('a concurrent change between read and write is rejected', async () => {
    const versions = new Map<string, string>()
    const { files, fs } = memFs(versions)
    const store = makeStore(fs)
    files.set('/runs/r1.yml', '{"goal":"old"}')
    versions.set('/runs/r1.yml', 'v-read')

    const node = await store.read('r1', passSchema)
    versions.set('/runs/r1.yml', 'v-concurrent') // someone else landed a write
    expect(store.write('r1', node, passSchema)).rejects.toThrow(/changed since it was read/)
    expect(files.get('/runs/r1.yml')).toBe('{"goal":"old"}')
  })

  test('an unchanged version writes through', async () => {
    const versions = new Map<string, string>()
    const { files, fs } = memFs(versions)
    const store = makeStore(fs)
    files.set('/runs/r1.yml', '{"goal":"old"}')
    versions.set('/runs/r1.yml', 'v-read')

    const node = await store.read('r1', passSchema)
    ;(node as Record<string, unknown>)['goal'] = 'new'
    await store.write('r1', node, passSchema)
    expect(files.get('/runs/r1.yml')).toBe('{"goal":"new"}')
  })
})

describe('read', () => {
  test('parses yaml then validates with the given schema', async () => {
    const { files, fs } = memFs()
    files.set('/runs/r1.yml', '{"goal":"g"}')
    const seen: unknown[] = []
    const spy: Schema = {
      parse: (x) => {
        seen.push(x)
        return x
      },
    }
    const node = await makeStore(fs).read('r1', spy)
    expect(node['goal']).toBe('g')
    expect(Object.keys(node)).toEqual(['goal']) // the CAS version rides on a symbol, not a key
    expect(seen).toHaveLength(1)
  })
})

describe('list', () => {
  test('returns sorted slugs, ignores temp files, empty without a runs dir', async () => {
    const { files, fs } = memFs()
    const store = makeStore(fs)
    expect(await store.list()).toEqual([])
    files.set('/runs/zeta.yml', '{}')
    files.set('/runs/alpha.yml', '{}')
    files.set('/runs/alpha.yml.tmp.1.r', '{}')
    files.set('/runs/notes.txt', 'x')
    expect(await store.list()).toEqual(['alpha', 'zeta'])
  })
})
