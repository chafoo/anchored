// _v3/cli/envelope.ts — the cli-only-transport format. Every call emits exactly one envelope
// { ok, command, next?, result|error }. With --json it is JSON (machine-parseable for skills +
// agents); by default it renders as one dense readable line (render-line.ts). A thrown
// AnchoredError is flattened to { name(kind), message, suggestions? } (no stacktrace leak).
// `next` (F2) is the pre-parameterised next action, computed off the returned node so the
// readable line carries the loop's next step. cli-local: the transport shape is the cli's
// concern, single consumer.
import type { AnchoredError } from '../lib/utils/error.js'
import { nextHint } from './scope/next-hint.js'

export interface Envelope {
  ok: boolean
  command: string
  /** the pre-parameterised next action (F2) — the legal forward transition / ready child. */
  next?: string
  result?: unknown
  error?: { name: string; message: string; suggestions?: string[] }
}

export function envelope(command: string, result?: unknown, error?: unknown): Envelope {
  if (error !== undefined) {
    const e = error as AnchoredError
    return {
      ok: false,
      command,
      error: {
        name: e.kind ?? e.name ?? 'Error',
        message: e.message ?? String(error),
        ...(e.suggestions ? { suggestions: e.suggestions } : {}),
      },
    }
  }
  const next = nextHint(result)
  return { ok: true, command, ...(next ? { next } : {}), result: result ?? null }
}
