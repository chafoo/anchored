// modules/run/scope/packet.ts — gate selection for `validate`: which criteria does ONE
// validator spawn get? Selects the still-provable criteria (open|failed) of a gate (or of
// the whole run), and enforces the mechanism rule that a gate is SETUP-HOMOGENEOUS — one
// validator, one instruction set. Also decides when a repeated `validate` is the SAME
// request and may reuse its snapshot instead of minting a new one.
import type { Criterion, RunFile, TrailEntry } from '../run.schemas.js'
import { anchoredError } from '../../../lib/utils/error.js'

export interface GateSelection {
  criteria: Criterion[]
  /** the one setup of the selection (undefined = defaults). */
  setup?: string
}

export function selectGate(run: RunFile, gate?: string): GateSelection {
  const pool = run.criteria.filter((c) => c.status === 'open' || c.status === 'failed')
  const selected = gate === undefined ? pool : pool.filter((c) => c.gate === gate)

  if (selected.length === 0)
    throw anchoredError(
      'NothingToValidate',
      gate === undefined
        ? 'no open or failed criteria — the run is fully proven'
        : `gate '${gate}' has no open or failed criteria`,
      [
        gate === undefined
          ? 'close the run: anchored close <slug>'
          : `gates with provable criteria: ${[...new Set(pool.map((c) => c.gate ?? '(final)'))].join(', ')}`,
      ],
    )

  const setups = new Set(selected.map((c) => c.setup))
  if (setups.size > 1)
    throw anchoredError(
      'MixedGate',
      `a gate is setup-homogeneous — selection spans: ${[...setups].map((s) => s ?? '(defaults)').join(', ')}`,
      ['validate per gate (--gate <g>) so each validator gets one instruction set'],
    )

  return { criteria: selected, setup: selected[0]!.setup }
}

/** The prose half of a validation trail entry — the structured snapshot sits beside it. */
export const requestLine = (criteria: Criterion[]) =>
  `requested ${criteria.map((c) => c.id).join(', ')}`

/**
 * The prior request for this gate, IF asking again would ask the very same thing: same
 * gate, same selection, and no proof written since. Then `validate` hands back that
 * snapshot and writes no second trail entry — a double call is one request, not two.
 *
 * A `fail` since the request DOES touch the selection (the criterion stays provable but
 * carries fresh evidence), so the fix-then-revalidate loop always mints a new snapshot.
 */
export function reusableRequest(
  run: RunFile,
  gate: string | undefined,
  selection: Criterion[],
): TrailEntry | undefined {
  const prior = [...run.trail].reverse().find((t) => t.validated !== undefined && t.gate === gate)
  if (prior?.snapshot === undefined || prior.validated !== requestLine(selection)) return undefined
  const since = Date.parse(prior.at)
  const provenSince = selection.some(
    (c) => c.evidence !== undefined && Date.parse(c.evidence.at) > since,
  )
  return provenSince ? undefined : prior
}
