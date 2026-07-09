#!/usr/bin/env node
// bin.ts — the runtime entry: constructs the REAL seams (node:fs, proper-lockfile, yaml,
// clock, entropy, stdio) and injects them into createCli. The only file that touches
// process/global effects directly.
import { promises as nodeFs } from 'node:fs'
import { randomBytes } from 'node:crypto'
import lockfile from 'proper-lockfile'
import { parse, stringify } from 'yaml'
import { createCli } from './cli/cli.js'
import type { FileSystem, Lock, Yaml } from './lib/contracts/fs.js'

// Kept in sync with package.json by bin.e2e.ts — inlined rather than read at runtime so
// the bundled single-file binary carries no package.json lookup.
const VERSION = '0.7.0'

const fs: FileSystem = {
  readFile: (p) => nodeFs.readFile(p, 'utf8'),
  writeFile: (p, d) => nodeFs.writeFile(p, d, 'utf8'),
  rename: (a, b) => nodeFs.rename(a, b),
  unlink: (p) => nodeFs.unlink(p),
  mkdir: (dir, opts) => nodeFs.mkdir(dir, opts),
  readdir: (dir) => nodeFs.readdir(dir),
  stat: async (p) => {
    try {
      const s = await nodeFs.stat(p)
      return `${s.mtimeMs}-${s.size}`
    } catch {
      return undefined
    }
  },
}

const lock: Lock = {
  acquire: (path) =>
    lockfile.lock(path, {
      realpath: false,
      stale: 10_000,
      retries: { retries: 5, minTimeout: 100, maxTimeout: 1_000 },
    }),
}

const yaml: Yaml = {
  parse: (raw, opts) => parse(raw, opts),
  stringify: (value, opts) => stringify(value, opts),
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

const cli = createCli({
  fs,
  lock,
  yaml,
  projectRoot: process.cwd(),
  clock: () => new Date().toISOString(),
  rand: () => randomBytes(4).toString('hex'),
  pid: () => process.pid,
  out: (line) => process.stdout.write(`${line}\n`),
  readStdin,
  version: VERSION,
})

process.exitCode = await cli.run(process.argv.slice(2))
