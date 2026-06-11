import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createInit } from './init.js'

function makeIo(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed))
  const writes: string[] = []
  const io = {
    atomicWrite: async (path: string, content: string) => {
      writes.push(path)
      store.set(path, content)
    },
    readFile: async (path: string) => {
      const d = store.get(path)
      if (d === undefined) throw new Error(`ENOENT ${path}`)
      return d
    },
  }
  return { io, store, writes }
}

const ROOT = '/p'
const YML = `${ROOT}/anchored.yml`
const SETTINGS = `${ROOT}/.claude/settings.local.json`

// lazy-init a1 — missing anchored.yml → MINIMAL file (directive + pointer), no tier blocks
test('a1: writes a minimal anchored.yml (directive + pointer, no copied default blocks)', async () => {
  const { io, store } = makeIo()
  const r = await createInit({ io }).ensure(ROOT)
  expect(r.wroteYml).toBe(true)
  const content = store.get(YML)!
  expect(content).toContain('yaml-language-server: $schema')
  expect(content).toContain('plugin/references/anchored.default.yml')
  // NOT a copy of the default config — no tier-stage blocks
  expect(content).not.toContain('steps:')
  expect(content).not.toMatch(/^\s*build:/m)
})

// lazy-init a2 — existing anchored.yml is NEVER overwritten
test('a2: an existing anchored.yml is not overwritten (idempotent)', async () => {
  const { io, writes } = makeIo({ [YML]: 'task:\n  build:\n    retry_limit: 5\n' })
  const r = await createInit({ io }).ensure(ROOT)
  expect(r.wroteYml).toBe(false)
  expect(writes).not.toContain(YML) // no write to the existing config
})

// lazy-init a3 — appends Bash(anchored *) preserving existing entries, idempotent
test('a3: appends Bash(anchored *) to settings.local.json without losing entries', async () => {
  const seed = JSON.stringify({ permissions: { allow: ['Bash(git status)'] } })
  const { io, store } = makeIo({ [SETTINGS]: seed })
  const init = createInit({ io })

  const r1 = await init.ensure(ROOT)
  expect(r1.wroteAllowlist).toBe(true)
  const parsed = JSON.parse(store.get(SETTINGS)!) as { permissions: { allow: string[] } }
  expect(parsed.permissions.allow).toContain('Bash(git status)') // preserved
  expect(parsed.permissions.allow.filter((a) => a === 'Bash(anchored *)').length).toBe(1)

  // second run does NOT add it again
  const r2 = await init.ensure(ROOT)
  expect(r2.wroteAllowlist).toBe(false)
  const reparsed = JSON.parse(store.get(SETTINGS)!) as { permissions: { allow: string[] } }
  expect(reparsed.permissions.allow.filter((a) => a === 'Bash(anchored *)').length).toBe(1)
})

// lazy-init a4 — missing settings.local.json → created with valid allow JSON
test('a4: creates settings.local.json with a valid allow entry when absent', async () => {
  const { io, store } = makeIo()
  await createInit({ io }).ensure(ROOT)
  const parsed = JSON.parse(store.get(SETTINGS)!) as { permissions: { allow: string[] } }
  expect(parsed.permissions.allow).toContain('Bash(anchored *)')

  // the init logic uses NO direct node:fs — only the injected io seam
  const initSrc = readFileSync(new URL('./init.ts', import.meta.url), 'utf8')
  expect(initSrc).not.toContain("from 'node:fs'")
})
