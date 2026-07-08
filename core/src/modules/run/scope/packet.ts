// modules/run/scope/packet.ts — gate selection for `validate`: which criteria does ONE
// validator spawn get? Selects the still-provable criteria (open|failed) of a gate (or of
// the whole run), and enforces the mechanism rule that a gate is SETUP-HOMOGENEOUS — one
// validator, one instruction set.
import type { Criterion, RunFile } from '../run.schemas.js'
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
