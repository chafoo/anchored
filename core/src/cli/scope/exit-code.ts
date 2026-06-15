// _v3/cli/scope/exit-code.ts — the F3 exit-code mapping (pure). A failed envelope gets a
// MEANINGFUL non-zero code off its error KIND, so the orchestrator can branch on the class of
// failure (usage vs. not-found vs. guard) without parsing the body. Success is always 0. Unknown
// kinds fall back to 1 (a plain failure). cli-local: the code mapping is a transport concern.
import type { Envelope } from '../envelope.js'

// 2 = usage / grammar misuse (a malformed command — the caller wrote it wrong).
const USAGE = new Set([
  'UnknownTier',
  'NoVerb',
  'UnknownVerb',
  'NoOp',
  'UnknownOp',
  'BadSlug',
  'ReservedField',
  'AcFieldReserved',
  'InvalidChildStatus',
])
// 3 = addressed thing not found.
const NOT_FOUND = new Set([
  'UnknownPhase',
  'UnknownChild',
  'UnknownAcceptance',
  'DuplicateSlug',
  'NotFound',
  'ENOENT',
])
// 4 = a guard / invariant refused a legal-looking op (the substrate said no).
const GUARD = new Set([
  'InvalidTransition',
  'PhaseIncomplete',
  'ChildrenIncomplete',
  'ConcernsOpen',
  'QuestionsOpen',
  'AcceptanceIncomplete',
  'AcceptanceNoEvidence',
  'AcceptanceNoReason',
  'AcNoReason',
  'AcNoEvidence',
  // a Zod schema-refine rejection IS the substrate invariant firing (e.g. a done-AC with no
  // evidence) — the store's only law. Classify it as a guard refusal, not a generic crash.
  'ZodError',
])

/** Map a (possibly failed) envelope to a process exit code — 0 ok, else a kind-specific non-zero. */
export function exitCode(env: Envelope): number {
  if (env.ok) return 0
  const name = env.error?.name ?? 'Error'
  if (USAGE.has(name)) return 2
  if (NOT_FOUND.has(name)) return 3
  if (GUARD.has(name)) return 4
  return 1
}
