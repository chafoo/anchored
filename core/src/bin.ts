#!/usr/bin/env node
// src/bin.ts — the bin entry: the ONLY site touching process.* / top-level await /
// the real node effects (fs, crypto). It wires those effects into the pure
// createAnchored factory (src/index.ts) and runs the cli. Keeping this here is what
// lets index.ts stay a pure, fakeable wiring factory.
import { mkdir, writeFile, rename, readFile, stat, open, unlink } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { createAnchored } from './index.js'
import { createInit } from './config/init.js'
import { createIo } from './store/io/io.js'

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
  unlink: (p: string) => unlink(p),
  // M4: a cheap version token (mtime+size) for the compare-and-swap. Missing file → undefined.
  statVersion: async (p: string): Promise<string | undefined> => {
    try {
      const s = await stat(p)
      return `${s.mtimeMs}:${s.size}`
    } catch {
      return undefined
    }
  },
}

// M4: a real cross-process file lock (replaces the no-op). An O_EXCL lockfile holds
// the PID + acquire-time; a holder older than STALE is taken over (crash recovery);
// acquisition gives up after TIMEOUT. bin.ts is the effectful entry, so wall-clock +
// setTimeout are allowed here (the determinism ban is on core/engine/config/ops).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const fileLock = {
  async acquire(path: string): Promise<() => Promise<void>> {
    const lockPath = `${path}.lock`
    const start = Date.now()
    const TIMEOUT = 10_000
    const STALE = 30_000
    for (;;) {
      try {
        const fh = await open(lockPath, 'wx') // O_EXCL — EEXIST if already held
        await fh.writeFile(`${process.pid} ${Date.now()}`)
        await fh.close()
        return async () => {
          try {
            await unlink(lockPath)
          } catch {
            /* already released */
          }
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
        try {
          const held = await readFile(lockPath, 'utf8')
          const ts = Number(held.split(' ')[1] ?? '0')
          if (Date.now() - ts > STALE) {
            await unlink(lockPath).catch(() => {})
            continue // stale holder (crashed) → take over
          }
        } catch {
          continue // lock vanished between EEXIST and read → retry immediately
        }
        if (Date.now() - start > TIMEOUT)
          throw new Error(`lock timeout after ${TIMEOUT}ms`, { cause: e })
        await sleep(15)
      }
    }
  },
}

const io = {
  fs,
  lock: fileLock,
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
    // L1a (harden-3): the real shell runner for `add-phase-evidence --run` — runs a
    // gate command in the project root, captures exit code + output. Non-zero exit
    // surfaces as GateFailed (the AC is NOT evidenced).
    run: (cmd: string) =>
      new Promise((resolve) => {
        exec(cmd, { cwd: root, timeout: 600_000, maxBuffer: 8 * 1024 * 1024 }, (err, so, se) => {
          const code =
            err && typeof (err as { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : err
                ? 1
                : 0
          resolve({ code, stdout: String(so), stderr: String(se) })
        })
      }),
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
