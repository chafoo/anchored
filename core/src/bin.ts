#!/usr/bin/env node
// src/bin.ts — the bin entry: the ONLY site touching process.* / top-level await /
// the real node effects (fs, crypto). It wires those effects into the pure
// createAnchored factory (src/index.ts) and runs the cli. Keeping this here is what
// lets index.ts stay a pure, fakeable wiring factory.
import { mkdir, writeFile, rename, readFile } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { createAnchored } from './index.js'
import { createInit } from './config/init.js'
import { createIo } from './io.js'

const root = process.cwd()
const defaultPath = fileURLToPath(
  new URL('../default-template/anchored.default.yml', import.meta.url),
)

// F5: real CLI version from package.json (bundled bin.js sits at dist/bin.js →
// ../package.json = the package root). Fail-soft: 0.0.0 if it can't be read.
const version = ((): string => {
  try {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

const fs = {
  mkdir: (dir: string, opts?: { recursive?: boolean }) => mkdir(dir, opts),
  writeFile: (p: string, data: string) => writeFile(p, data),
  rename: (from: string, to: string) => rename(from, to),
  readFile: (p: string) => readFile(p, 'utf8'),
}
const io = {
  fs,
  lock: { acquire: async () => async () => {} },
  rand: () => randomBytes(4).toString('hex'),
  pid: () => process.pid,
}

// lazy-init: seed a minimal anchored.yml + the Bash(anchored *) allowlist
await createInit({ io: createIo(io) }).ensure(root)

// createAnchored validates the merged anchored.yml at bootstrap — a ConfigError
// here means the user's yml is invalid. Emit it as a clean JSON envelope (so
// `anchored validate` and every other command report a malformed yml precisely
// instead of crashing with a stack trace).
try {
  const anchored = createAnchored({
    projectRoot: root,
    io,
    readDefault: () => readFileSync(defaultPath, 'utf8'),
    // M5 (harden-2): cap the anchored.yml size — a multi-MB config is malformed/
    // hostile, not a real delta-file. Rejected loudly before parse.
    readUser: (r) => {
      const p = `${r}/anchored.yml`
      if (!existsSync(p)) return undefined
      const raw = readFileSync(p, 'utf8')
      const MAX = 512 * 1024
      if (raw.length > MAX) {
        const e = new Error(`anchored.yml is ${raw.length} bytes (> ${MAX}) — likely malformed`)
        e.name = 'ConfigError'
        throw e
      }
      return raw
    },
    // M5: explicit alias cap (billion-laughs defence) on the config parse.
    parseYaml: (raw) => parse(raw, { maxAliasCount: 100 }),
    now: () => new Date().toISOString().slice(0, 10), // YYYY-MM-DD for `created`
    version,
    out: (line) => process.stdout.write(line + '\n'),
  })

  const code = await anchored.cli.run(process.argv.slice(2))
  process.exit(code)
} catch (err) {
  const e = err as { name?: string; message?: string; issues?: unknown }
  process.stdout.write(
    JSON.stringify({
      ok: false,
      command: process.argv[2] ?? '',
      error: {
        name: e.name || 'Error',
        message: e.message || String(err),
        ...(e.issues !== undefined ? { issues: e.issues } : {}),
      },
    }) + '\n',
  )
  process.exit(1)
}
