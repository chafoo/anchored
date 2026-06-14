// _v3/modules/shared/evidence.ts — the evidence predicate. Pure, tier-agnostic; the only
// consumer is the AcceptanceCriterion `.refine` (so it lives with the modules, not lib).
// "Evidence counts" = at least one non-empty, non-sentinel string.
export function isEvidenceFilled(evidence: unknown): boolean {
  if (!Array.isArray(evidence)) return false
  return evidence.some((e) => typeof e === 'string' && e.trim() !== '' && e.trim() !== '—')
}
