// _v3/services/template/stages.ts — the four lifecycle stages, defined ONCE. Only the
// template uses this (validate() iterates tier×stage); the tier modules just have methods
// named plan/refine/build/wrap. Every tier walks the same axis; build.each is the recursion.
export const STAGES = ['plan', 'refine', 'build', 'wrap'] as const

export type Stage = (typeof STAGES)[number]
