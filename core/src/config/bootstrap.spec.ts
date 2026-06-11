import { test, expect } from 'bun:test'
import { parse } from 'yaml'
import { createBootstrap, type BootstrapDeps } from './bootstrap.js'

const defaultYaml =
  'phase:\n  build:\n    steps:\n      - { name: implement }\ntask:\n  build:\n    each: phase\n    retry_limit: 3\n'

function deps(userYaml?: string): BootstrapDeps {
  return {
    readDefault: () => defaultYaml,
    readUser: () => userYaml,
    parseYaml: (raw: string) => parse(raw),
  }
}

// a1 — factory over injected deps
test('createBootstrap is a factory over injected deps', () => {
  expect(typeof createBootstrap(deps()).load).toBe('function')
})

// a2 — zero-config: missing anchored.yml ⇒ full default
test('zero-config: missing anchored.yml yields the default', () => {
  const cfg = createBootstrap(deps(undefined)).load('/proj')
  expect(cfg.task?.build?.each).toBe('phase')
  expect(cfg.task?.build?.retry_limit).toBe(3)
})

// a3 — user delta merges onto default (default from reference, not projectRoot)
test('user delta merges onto the default; user file read from projectRoot', () => {
  let readArg = ''
  const d: BootstrapDeps = {
    readDefault: () => defaultYaml,
    readUser: (root: string) => {
      readArg = root
      return 'task:\n  build:\n    retry_limit: 9\n'
    },
    parseYaml: (raw: string) => parse(raw),
  }
  const cfg = createBootstrap(d).load('/proj')
  expect(readArg).toBe('/proj')
  expect(cfg.task?.build?.retry_limit).toBe(9) // user override
  expect(cfg.task?.build?.each).toBe('phase') // from default reference
})

// a4 — invalid user config throws a clear error
test('invalid user config throws ConfigError', () => {
  expect(() => createBootstrap(deps('bogusTopLevel: 1\n')).load('/proj')).toThrow(
    /invalid anchored\.yml/,
  )
})

// a6 — lazy-init regression: a comments-only anchored.yml parses to null and must
// be treated as zero-config (NOT a ConfigError). This is exactly what lazy-init
// writes on first run.
test('comments-only anchored.yml (parses to null) is treated as zero-config', () => {
  const commentsOnly = '# just a comment\n# another line\n'
  const cfg = createBootstrap(deps(commentsOnly)).load('/proj')
  expect(cfg.task?.build?.each).toBe('phase') // full default, no throw
})

// a5 — result is consumable as deps.config
test('effectiveConfig is consumable as { config }', () => {
  const config = createBootstrap(deps(undefined)).load('/proj')
  const createConsumer = (cdeps: { config: typeof config }) => ({
    ok: cdeps.config.task !== undefined,
  })
  expect(createConsumer({ config }).ok).toBe(true)
})
