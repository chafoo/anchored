import { test, expect } from 'bun:test'
import { STAGES } from './stages.js'

test('STAGES is the fixed plan→refine→build→wrap axis', () => {
  expect(STAGES).toEqual(['plan', 'refine', 'build', 'wrap'])
})
