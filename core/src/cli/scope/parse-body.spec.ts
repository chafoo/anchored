import { test, expect } from 'bun:test'
import { parse, stringify } from 'yaml'
import { parseBody } from './parse-body.js'
import type { Yaml } from '../../lib/contracts/fs.js'

const yaml: Yaml = { parse: (raw) => parse(raw) as unknown, stringify: (v) => stringify(v) }

test('parses YAML and JSON bodies (yaml is a superset)', () => {
  expect(parseBody(yaml, 'goal: g\ncriteria:\n  - text: t\n', 'anchor')).toMatchObject({
    goal: 'g',
  })
  expect(parseBody(yaml, '{"reason": "r", "reject": ["c1"]}', 'amend')).toMatchObject({
    reason: 'r',
  })
})

test('empty stdin, broken syntax and non-objects are Usage errors', () => {
  expect(() => parseBody(yaml, '', 'anchor')).toThrow(/reads its body from stdin/)
  expect(() => parseBody(yaml, '{bad', 'anchor')).toThrow(/not valid YAML/)
  expect(() => parseBody(yaml, '- just\n- a list\n', 'anchor')).toThrow(/must be a mapping/)
})
