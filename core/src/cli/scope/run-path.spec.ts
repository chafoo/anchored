import { test, expect } from 'bun:test'
import { runsDir, runPathFor } from './run-path.js'

test('a run lives at <root>/.claude/anchored/<slug>.yml', () => {
  expect(runsDir('/repo')).toBe('/repo/.claude/anchored')
  expect(runPathFor('/repo')('fix-navbar')).toBe('/repo/.claude/anchored/fix-navbar.yml')
})
