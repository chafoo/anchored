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

const anchored = createAnchored({
  projectRoot: root,
  io,
  readDefault: () => readFileSync(defaultPath, 'utf8'),
  readUser: (r) =>
    existsSync(`${r}/anchored.yml`) ? readFileSync(`${r}/anchored.yml`, 'utf8') : undefined,
  parseYaml: (raw) => parse(raw),
  now: () => new Date().toISOString().slice(0, 10), // YYYY-MM-DD for `created`
  out: (line) => process.stdout.write(line + '\n'),
})

const code = await anchored.cli.run(process.argv.slice(2))
process.exit(code)
