#!/usr/bin/env node
// _v3/bin.ts — the bin entry: the ONLY site touching process.* / the real node effects
// (fs, crypto). It builds the FileSystem · Lock · Yaml · reader seams and injects them into
// the pure createCli factory, then runs the dispatcher. Keeping this here is what lets the
// whole engine stay pure + fakeable.
import { mkdir, writeFile, rename, readFile, stat, open, unlink } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'
import { createCli } from './cli/cli.js'
import { renderLine } from './cli/scope/render-line.js'
import * as layout from './cli/layout.js'
import type { FileSystem, Lock } from './lib/contracts/fs.js'

const root = process.cwd()
const defaultPath = fileURLToPath(
  new URL('../default-template/anchored.default.yml', import.meta.url),
)

const version = ((): string => {
  try {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as {
      version?: string
    }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

const fs: FileSystem = {
  readFile: (p) => readFile(p, 'utf8'),
  writeFile: (p, d) => writeFile(p, d),
  rename: (from, to) => rename(from, to),
  unlink: (p) => unlink(p),
  mkdir: (dir, opts) => mkdir(dir, opts),
  // a cheap version token (mtime+size) for the compare-and-swap. Missing file → undefined.
  stat: async (p) => {
    try {
      const s = await stat(p)
      return `${s.mtimeMs}:${s.size}`
    } catch {
      return undefined
    }
  },
}

// a real cross-process O_EXCL file lock (PID + acquire-time; stale holder taken over).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const lock: Lock = {
  async acquire(path) {
    const lockPath = `${path}.lock`
    const start = Date.now()
    const TIMEOUT = 10_000
    const STALE = 30_000
    for (;;) {
      try {
        const fh = await open(lockPath, 'wx')
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
            continue
          }
        } catch {
          continue
        }
        if (Date.now() - start > TIMEOUT)
          throw new Error(`lock timeout after ${TIMEOUT}ms`, { cause: e })
        await sleep(15)
      }
    }
  },
}

const cli = createCli({
  fs,
  lock,
  yaml: {
    parse: (raw, o) => parse(raw, { maxAliasCount: o?.maxAliasCount ?? 100 }),
    stringify: (v, o) => stringify(v, o),
  },
  pathFor: (slug, tier) => layout.pathFor(root, slug, tier),
  archivePathFor: (slug, tier) => layout.archivePathFor(root, slug, tier),
  rand: () => randomBytes(4).toString('hex'),
  pid: () => process.pid,
  readDefault: () => readFileSync(defaultPath, 'utf8'),
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
  parseYaml: (raw) => parse(raw, { maxAliasCount: 100 }),
  projectRoot: root,
  out: (line) => process.stdout.write(line + '\n'),
  // the input twin of `out` — the ONLY site allowed to touch real stdin. fd 0 reads the whole
  // body a `-` positional asks for (G2/G3); an empty/absent stdin yields '' (the cli/tier guards).
  readStdin: () => {
    try {
      return readFileSync(0, 'utf8')
    } catch {
      return ''
    }
  },
  version,
})

cli
  .run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    // the pre-dispatcher crash path (the cli never got to emit). Render the same readable line
    // (F1/F3 consistency) — unless --json was asked, then keep the raw envelope.
    const e = err as { name?: string; message?: string }
    const command = (process.argv[2] ?? '').startsWith('-') ? '' : (process.argv[2] ?? '')
    const env = {
      ok: false as const,
      command,
      error: { name: e.name || 'Error', message: e.message || String(err) },
    }
    const json = process.argv.includes('--json')
    process.stdout.write((json ? JSON.stringify(env) : renderLine(env)) + '\n')
    process.exit(1)
  })
