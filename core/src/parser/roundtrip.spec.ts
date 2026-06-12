import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { createParser } from './parse.js'
import { createRenderer, defaultSchemaUrl } from './render.js'
import { createIo, type IoDeps } from '../io.js'
import { TaskNodeSchema } from '../schema/tiers/task.js'
import { EpicNodeSchema } from '../schema/tiers/epic.js'

const schemas = { task: TaskNodeSchema, epic: EpicNodeSchema }
const parser = createParser({ yaml: { parse }, schemas })
const renderer = createRenderer({ yaml: { stringify }, schemaUrl: defaultSchemaUrl })

function fixture(name: string): string {
  return readFileSync(new URL(`../../../plugin/references/${name}`, import.meta.url), 'utf8')
}

// a1 — parse(render(parse(raw))) deep-equals parse(raw) for both tiers
test('round-trip is idempotent for task + epic fixtures', () => {
  for (const [name, tier] of [
    ['task.example.yml', 'task'],
    ['epic.example.yml', 'epic'],
  ] as const) {
    const raw = fixture(name)
    const once = parser.parseNodeYAML(raw, { profile: 'task-file', tier })
    const rendered = renderer.renderNodeYAML(once, { tier })
    const twice = parser.parseNodeYAML(rendered, { profile: 'task-file', tier })
    expect(twice).toEqual(once)
  }
})

// a2 — write path end-to-end with fakeFs
test('atomicWrite(render(node)) → readFile → parse deep-equals node', async () => {
  const files = new Map<string, string>()
  const deps: IoDeps = {
    fs: {
      async mkdir() {
        return undefined
      },
      async writeFile(p: string, data: string) {
        files.set(p, data)
      },
      async rename(from: string, to: string) {
        const d = files.get(from)
        files.delete(from)
        if (d !== undefined) files.set(to, d)
      },
      async unlink(p: string) {
        files.delete(p)
      },
      async readFile(p: string) {
        const d = files.get(p)
        if (d === undefined) throw new Error('ENOENT')
        return d
      },
    },
    lock: {
      async acquire() {
        return async () => {}
      },
    },
    rand: () => 'r',
    pid: () => 1,
  }
  const io = createIo(deps)
  const node = parser.parseNodeYAML(fixture('task.example.yml'), {
    profile: 'task-file',
    tier: 'task',
  })
  await io.atomicWrite('t/x.yml', renderer.renderNodeYAML(node, { tier: 'task' }))
  const back = parser.parseNodeYAML(await io.readFile('t/x.yml'), {
    profile: 'task-file',
    tier: 'task',
  })
  expect(back).toEqual(node)
})

// a3 — prose with YAML-dangerous chars survives render→parse (block-scalar protects)
test('prose with colons/dashes/quotes/newlines survives render→parse', () => {
  const node = {
    schema_version: 2,
    slug: 'danger',
    title: 'T',
    status: 'plan',
    context: { plan: 'key: value\n- leading dash\n"quoted" and \'single\'\nmulti\nline\n' },
  }
  const rendered = renderer.renderNodeYAML(node, { tier: 'task' })
  expect(rendered).toMatch(/plan: \|/)
  const back = parser.parseNodeYAML(rendered, { profile: 'task-file', tier: 'task' }) as typeof node
  expect(back.context.plan).toBe(node.context.plan)
})
