// cli/envelope.ts — the ONE output shape. JSON-only (the consumers are skills + agents):
// every cli call emits exactly one envelope line — { ok, command, result } on success,
// { ok, command, error: { kind, message, suggestions? } } on refusal. No render-line, no
// prose mode.
import type { AnchoredError } from '../lib/utils/error.js'

export interface EnvelopeError {
  kind: string
  message: string
  suggestions?: string[]
}

export interface Envelope {
  ok: boolean
  command: string
  result?: unknown
  error?: EnvelopeError
}

export function okEnvelope(command: string, result: unknown): Envelope {
  return { ok: true, command, result }
}

export function errEnvelope(command: string, e: unknown): Envelope {
  if (e instanceof Error && 'kind' in e) {
    const a = e as AnchoredError
    return {
      ok: false,
      command,
      error: {
        kind: a.kind,
        message: a.message,
        ...(a.suggestions !== undefined ? { suggestions: a.suggestions } : {}),
      },
    }
  }
  // a schema rejection out of the store (zod) = the invariant speaking
  if (typeof e === 'object' && e !== null && 'issues' in e) {
    return {
      ok: false,
      command,
      error: { kind: 'SchemaViolation', message: (e as unknown as Error).message },
    }
  }
  return {
    ok: false,
    command,
    error: { kind: 'Error', message: e instanceof Error ? e.message : String(e) },
  }
}
