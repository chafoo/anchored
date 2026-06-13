// state/invariants.ts — the hard substrate invariant: no ac→done without evidence.
// Enforced at the DATA MODEL, never in a (skippable) step. Pure predicates +
// throwing asserts with typed errors; no hidden effects, no classes.

export interface AnchoredError extends Error {
  kind: string
  suggestions?: string[]
}

/** Factory for a typed error (no class — factory-functions rule). */
export function anchoredError(
  kind: string,
  message: string,
  suggestions?: string[],
): AnchoredError {
  const e = new Error(message) as AnchoredError
  e.name = kind
  e.kind = kind
  if (suggestions) e.suggestions = suggestions
  return e
}

/** A piece of evidence counts only if it is a non-empty, non-sentinel string. */
export function isEvidenceFilled(evidence: unknown): boolean {
  if (!Array.isArray(evidence)) return false
  return evidence.some((e) => typeof e === 'string' && e.trim() !== '' && e.trim() !== '—')
}

export interface AcLike {
  id?: string
  status?: string
  evidence?: unknown
}

/** An acceptance criterion may only be `done` if it carries real evidence. */
export function assertAcDoneHasEvidence(ac: AcLike): void {
  if (ac.status === 'done' && !isEvidenceFilled(ac.evidence)) {
    throw anchoredError(
      'IncompleteEvidence',
      `acceptance criterion '${ac.id ?? '?'}' cannot be 'done' without evidence`,
      ['add a concrete evidence entry (file:line / test output) before status: done'],
    )
  }
}

/**
 * The epic-tier sibling of {@link assertAcDoneHasEvidence}: an epic DoD
 * acceptance ITEM only flips `done` WITH delivery evidence — the same
 * evidence-honesty floor as a phase AC, one tier up. The caller passes the
 * already-merged evidence (existing + newly-passed); we reject a `done` flip
 * when that merged set is empty.
 */
export function assertEpicAcHasEvidence(
  id: string,
  status: string,
  merged: string[] | undefined,
): void {
  if (status === 'done' && (!merged || merged.length === 0)) {
    throw anchoredError(
      'AcceptanceNoEvidence',
      `acceptance item '${id}' cannot be done without delivery evidence`,
      [
        `pass the provenance pointer(s): set-acceptance-status <slug> ${id} done "<task>/<phase> — delivered"`,
      ],
    )
  }
}

export interface NodeLike {
  acceptance_criteria?: AcLike[]
}

/** A node may only complete when every acceptance criterion is evidence-backed. */
export function assertNodeCompletable(node: NodeLike): void {
  const acs = node.acceptance_criteria ?? []
  const unbacked = acs.filter((ac) => !isEvidenceFilled(ac.evidence)).map((ac) => ac.id ?? '?')
  if (unbacked.length > 0) {
    throw anchoredError(
      'IncompleteEvidence',
      `node cannot complete — acceptance criteria without evidence: ${unbacked.join(', ')}`,
      unbacked.map((id) => `provide evidence for '${id}'`),
    )
  }
}
