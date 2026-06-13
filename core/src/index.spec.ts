import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createAnchored, tierOfNode, type AnchoredDeps } from './index.js'
import type { Config } from './schema/config/config.js'

function baseDeps(over: Partial<AnchoredDeps> = {}): AnchoredDeps {
  return {
    projectRoot: '/tmp/p',
    io: {
      fs: {
        mkdir: async () => undefined,
        writeFile: async () => undefined,
        rename: async () => undefined,
        readFile: async () => {
          throw new Error('ENOENT')
        },
        unlink: async () => undefined,
      },
      lock: { acquire: async () => async () => {} },
      rand: () => 'r',
      pid: () => 1,
    },
    readDefault: () => '{}',
    readUser: () => undefined,
    parseYaml: () => ({}), // empty config is valid (all tiers optional)
    out: () => {},
    ...over,
  }
}

// public-wiring a1 — createAnchored returns { cli, ops, config } and
// index.ts has no top-level side-effect / class / process access
test('a1: createAnchored returns the object graph; index.ts is a pure factory', () => {
  const a = createAnchored(baseDeps())
  expect(Object.keys(a).sort()).toEqual(['cli', 'config', 'ops'])
  expect(typeof a.cli.run).toBe('function')
  expect(typeof a.ops.read).toBe('function')

  // grep parity: `grep -nE 'class |process\.|^[^/]*await ' src/index.ts` is empty
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  const offenders = src
    .split('\n')
    .filter((l) => /^[^/]*await /.test(l) || /class /.test(l) || /process\./.test(l))
  expect(offenders).toEqual([])
})

// public-wiring a2 — bootstrap runs once: merge is called exactly once and the
// cli receives the merged config-bearing deps
test('a2: merge runs once; the cli gets the merged config', () => {
  let mergeCalls = 0
  let cliConfig: unknown
  const merged = { task: {} } as Config

  createAnchored(
    baseDeps({
      wiring: {
        merge: (d) => {
          mergeCalls++
          return { ...d, ...merged }
        },
        createCli: (deps) => {
          cliConfig = (deps as { steps: unknown }).steps
          return { run: async () => 0 }
        },
      },
    }),
  )

  expect(mergeCalls).toBe(1)
  // the cli got the steps planner built from the merged config (previous stage)
  expect(typeof cliConfig).toBe('function')
})

// public-wiring a3 — deps-graph order: createNodeOps BEFORE createCli
test('a3: wiring order is ops → cli', () => {
  const order: string[] = []
  createAnchored(
    baseDeps({
      wiring: {
        createNodeOps: (() => {
          order.push('ops')
          return {}
        }) as never,
        createCli: (() => {
          order.push('cli')
          return { run: async () => 0 }
        }) as never,
      },
    }),
  )
  const firstOps = order.indexOf('ops')
  const cliAt = order.indexOf('cli')
  expect(firstOps).toBeGreaterThanOrEqual(0)
  expect(firstOps).toBeLessThan(cliAt)
})

// tierOfNode is the shared tier-derivation used by the engine adapter + cli
test('tierOfNode derives epic/task from the child collection', () => {
  expect(tierOfNode({ slug: 'e', status: 'build', tasks: [] })).toBe('epic')
  expect(tierOfNode({ slug: 't', status: 'build', phases: [] })).toBe('task')
  expect(tierOfNode({ slug: 'x', status: 'plan' })).toBe('task')
})
