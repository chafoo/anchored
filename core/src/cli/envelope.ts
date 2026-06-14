// _v3/cli/envelope.ts — the cli-only-transport format. Every call emits exactly one JSON
// envelope { ok, command, result|error } to stdout — machine-parseable for the skills +
// agents. A thrown AnchoredError is flattened to { name(kind), message, suggestions? } (no
// stacktrace leak). cli-local: the transport shape is the cli's concern, single consumer.
import type { AnchoredError } from '../lib/utils/error.js'

export interface Envelope {
  ok: boolean
  command: string
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
  return { ok: true, command, result: result ?? null }
}
