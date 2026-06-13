import { test, expect } from 'bun:test'
import { parse, stringify } from 'yaml'
import { createRenderer, defaultSchemaUrl } from './render.js'

const renderer = createRenderer({ yaml: { stringify }, schemaUrl: defaultSchemaUrl })

// a1 — schema directive on line 1, tier-specific URL
test('renderNodeYAML emits the schema directive on line 1 per tier', () => {
  const taskOut = renderer.renderNodeYAML({ schema_version: 2, slug: 'x' }, { tier: 'task' })
  const epicOut = renderer.renderNodeYAML({ schema_version: 2, slug: 'e' }, { tier: 'epic' })
  expect(taskOut.split('\n')[0]).toBe(
    '# yaml-language-server: $schema=https://raw.githubusercontent.com/chafoo/anchored/main/plugin/references/schema/task.schema.json',
  )
  expect(epicOut.split('\n')[0]).toContain('epic.schema.json')
})

// a2 — multiline prose → block-scalar; round-trip preserves the value
test('multiline prose emits as block-scalar and round-trips', () => {
  const node = { name: 'x', context: { plan: 'line one\nline two\n' } }
  const out = renderer.renderNodeYAML(node, { tier: 'task' })
  expect(out).toMatch(/plan: \|/)
  expect(out).not.toMatch(/\\n/) // not a quoted string with escapes
  const back = parse(out.split('\n').slice(1).join('\n')) as typeof node
  expect(back.context.plan).toBe('line one\nline two\n')
})

// a3 — key order preserved, exactly one trailing newline, 2-space indent
test('key order preserved, single EOF newline, 2-space indent', () => {
  const out = renderer.renderNodeYAML({ z: 1, a: 2, nested: { b: 3 } }, { tier: 'task' })
  const body = out.split('\n').slice(1).join('\n')
  expect(body.indexOf('z:')).toBeLessThan(body.indexOf('a:')) // no alpha sort
  expect(out.endsWith('\n')).toBe(true)
  expect(out.endsWith('\n\n')).toBe(false)
  expect(out).toMatch(/\n {2}b: 3/) // 2-space indent
})
