// _v3/modules/shared/acceptance.ts — acceptance-criterion list transforms (pure). The shared
// AC primitives, reused by every place that owns an `acceptance_criteria[]`: the phase CONTENT
// verbs (task file) AND the epic task-STUB outcome ACs (the loop-queue stubs).
// One source of truth for id-allocation + the evidence/failures lifecycle. Tier-agnostic — the
// evidence invariant itself is enforced downstream by the schema on every store.write.
import { anchoredError } from '../../lib/utils/error.js'

export interface AcLike {
  id: string
  text?: string
  status: string
  evidence?: string[]
  failures?: string[]
  reason?: string
}

/** Next free `aN` id for an AC list (max existing + 1). */
export function nextAcId(acs: { id: string }[]): string {
  const max = acs.reduce((m, ac) => {
    const n = /^a(\d+)$/.exec(ac.id)
    return n ? Math.max(m, Number(n[1])) : m
  }, 0)
  return `a${max + 1}`
}

/** When an AC flips done after a failures-driven redo, retire its transient failures. */
export function retireFailures<T extends AcLike>(ac: T): T {
  if (!('failures' in ac)) return ac
  const { failures: _drop, ...rest } = ac
  void _drop
  return rest as T
}

export function addAc<T extends AcLike>(acs: T[], text: string, id?: string): T[] {
  const acId = id ?? nextAcId(acs)
  if (acs.some((a) => a.id === acId))
    throw anchoredError('DuplicateAc', `ac '${acId}' already exists`)
  return [...acs, { id: acId, text, status: 'pending' } as T]
}

const mapAc = <T extends AcLike>(acs: T[], acId: string, fn: (ac: T) => T): T[] => {
  if (!acs.some((a) => a.id === acId)) {
    throw anchoredError('UnknownAc', `no acceptance criterion '${acId}'`)
  }
  return acs.map((a) => (a.id === acId ? fn(a) : a))
}

/** Evidence makes the AC pass: append the proof + flip done + retire any prior failures. */
export function evidenceAc<T extends AcLike>(acs: T[], acId: string, proof: string): T[] {
  return mapAc(acs, acId, (ac) =>
    retireFailures({ ...ac, evidence: [...(ac.evidence ?? []), proof], status: 'done' }),
  )
}

/** A gate rejecting the AC: record why + flip back to pending (prior evidence stays history). */
export function failAc<T extends AcLike>(acs: T[], acId: string, why: string): T[] {
  return mapAc(acs, acId, (ac) => ({
    ...ac,
    failures: [...(ac.failures ?? []), why],
    status: 'pending',
  }))
}

/** Explicit done (only survives store.write if evidence is already present — schema-enforced). */
export function doneAc<T extends AcLike>(acs: T[], acId: string): T[] {
  return mapAc(acs, acId, (ac) => retireFailures({ ...ac, status: 'done' }))
}

/** Defer an AC: record the reason + flip to deferred. A deferred AC is terminal — the
 *  completion floors do not block on it. The reason is required (the schema also enforces it,
 *  but we check here for a clean message instead of a raw schema error). */
export function deferAc<T extends AcLike>(acs: T[], acId: string, reason: string): T[] {
  if (!(reason && reason.trim())) {
    throw anchoredError('AcNoReason', `cannot defer '${acId}' without a reason`, [
      'pass why it is postponed: ac-defer <slug> <ac-id> "<reason>"',
    ])
  }
  return mapAc(acs, acId, (ac) => retireFailures({ ...ac, status: 'deferred', reason }))
}
