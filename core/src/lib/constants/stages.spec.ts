import { test, expect } from 'bun:test'
import { STAGES } from './stages.js'

// the four lifecycle stages, fixed and ordered — every tier walks plan→refine→
// build→wrap (build.each is the fractal recursion, the phase tier is the leaf).
test('STAGES is the fixed plan→refine→build→wrap axis', () => {
  expect(STAGES).toEqual(['plan', 'refine', 'build', 'wrap'])
})
