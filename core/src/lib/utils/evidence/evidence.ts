// lib/utils/evidence/evidence.ts — the evidence predicate, a pure primitive with
// no special knowledge: "does this value carry at least one real evidence string".
// It lives in lib (not in the store's invariants) because BOTH sides need it — the
// tier module's schema uses it as the second line of defence (a `done` AC must
// carry evidence), and the store's write-path guards use it as the first. A util:
// zero deps, imported by module + service alike.

/** A piece of evidence counts only if it is a non-empty, non-sentinel string. */
export function isEvidenceFilled(evidence: unknown): boolean {
  if (!Array.isArray(evidence)) return false
  return evidence.some((e) => typeof e === 'string' && e.trim() !== '' && e.trim() !== '—')
}
