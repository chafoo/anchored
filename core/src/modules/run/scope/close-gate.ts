// modules/run/scope/close-gate.ts — the friendly half of the close gate: the blocker list
// the `close` verb returns BEFORE attempting the write (the schema backstop re-checks the
// same rule fail-closed on persist). Active = open|done|failed; superseded/rejected never
// block.
import { ACTIVE_STATUSES, type RunFile } from '../run.schemas.js'

export interface CloseBlocker {
  id: string
  status: string
  text: string
}

export function closeBlockers(run: RunFile): CloseBlocker[] {
  return run.criteria
    .filter((c) => (ACTIVE_STATUSES as readonly string[]).includes(c.status) && c.status !== 'done')
    .map((c) => ({ id: c.id, status: c.status, text: c.text }))
}
