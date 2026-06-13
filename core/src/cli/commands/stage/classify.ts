// cli/commands/stage/classify.ts — the stage-domain helpers pulled OUT of the
// transport: slug derivation + the deterministic classify tripwire. These are pure
// functions (no deps, no effect, no state) used by the plan command; keeping them
// here leaves plan.ts as thin arg-parsing + dispatch and cli.ts as pure JSON
// envelope logic. No factory needed — pure helpers stay free functions.

/** Derive a kebab-slug from a free-text input. */
export function slugFromInput(input: string): string {
  // slice FIRST, then strip leading/trailing dashes — the cut can land mid-word and
  // leave a trailing dash, which the kebab-slug regex rejects (F14).
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 48)
      .replace(/(^-|-$)/g, '') || 'untitled'
  )
}

/** Deterministic classify tripwire: phase-count + (grey-zone) independence test
 *  → recommended tier. The AI judgement (independent?) comes from the spawn seam
 *  (fractal-redesign-notes Item 1: <5 task / 5–9 independence / ≥10 epic). */
export function classifyTier(phaseCount: number, independent?: boolean): 'task' | 'epic' {
  if (phaseCount < 5) return 'task'
  if (phaseCount >= 10) return 'epic'
  return independent ? 'epic' : 'task' // 5–9 grey zone: the independence test decides
}
