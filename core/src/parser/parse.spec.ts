import { test, expect } from 'bun:test'
import { parse } from 'yaml'
import { createParser } from './parse.js'
import { TaskNodeSchema } from '../schema/tiers/task.js'
import { EpicNodeSchema } from '../schema/tiers/epic.js'
import { ConfigSchema } from '../schema/config.js'

const realSchemas = {
  task: TaskNodeSchema,
  epic: EpicNodeSchema,
  config: ConfigSchema,
}

// a1 — pure factory: yaml + schemas come only from deps, fakeable
test('createParser runs with fake yaml + fake schemas (no real yaml/fs)', () => {
  let fakeYamlCalled = false
  const fakeYaml = {
    parse: () => {
      fakeYamlCalled = true
      return { schema_version: 2, slug: 'x', title: 'T', status: 'plan' }
    },
  }
  const fakeSchemas = { task: { parse: (x: unknown) => x } }
  const parser = createParser({ yaml: fakeYaml, schemas: fakeSchemas })
  const node = parser.parseNodeYAML('ignored', { profile: 'task-file', tier: 'task' }) as {
    slug: string
  }
  expect(fakeYamlCalled).toBe(true)
  expect(node.slug).toBe('x')
})

// a2 — task-file rejects aliases; anchored.yml parses the _lib-alias input
test('profile task-file rejects alias; anchored.yml accepts _lib alias', () => {
  const parser = createParser({ yaml: { parse }, schemas: realSchemas })
  const aliasInput =
    '_lib:\n  base: &base { name: implement }\nphase:\n  build:\n    steps:\n      - *base\n'
  expect(() => parser.parseNodeYAML(aliasInput, { profile: 'task-file', tier: 'config' })).toThrow()
  const cfg = parser.parseNodeYAML(aliasInput, { profile: 'anchored.yml', tier: 'config' }) as {
    phase: { build: { steps: { name: string }[] } }
  }
  expect(cfg.phase.build.steps[0]?.name).toBe('implement')
})

// a3 — schema_version gate before generic validation
test('schema_version gate: missing/wrong throw, valid parses', () => {
  const parser = createParser({ yaml: { parse }, schemas: realSchemas })
  const valid = 'schema_version: 2\nslug: my-task\ntitle: T\nstatus: plan\n'
  const node = parser.parseNodeYAML(valid, { profile: 'task-file', tier: 'task' }) as {
    slug: string
  }
  expect(node.slug).toBe('my-task')
  expect(() =>
    parser.parseNodeYAML('slug: x\ntitle: T\nstatus: plan\n', {
      profile: 'task-file',
      tier: 'task',
    }),
  ).toThrow()
  expect(() =>
    parser.parseNodeYAML('schema_version: 1\nslug: x\ntitle: T\nstatus: plan\n', {
      profile: 'task-file',
      tier: 'task',
    }),
  ).toThrow()
})
