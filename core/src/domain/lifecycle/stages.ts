// domain/lifecycle/stages.ts — the four lifecycle stages, defined ONCE. Every
// tier walks plan→refine→build→wrap; build.each is the fractal recursion, the
// phase tier is the leaf. Formerly hardcoded as a stage-array literal in
// ops/validate and elsewhere — centralized here so the lifecycle has a single
// home in the domain layer.
export const STAGES = ['plan', 'refine', 'build', 'wrap'] as const

export type Stage = (typeof STAGES)[number]
