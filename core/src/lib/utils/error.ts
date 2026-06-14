// error.ts — the shared typed-error primitive. The whole engine throws an
// AnchoredError (typed: kind + suggestions) so a rejected op reads the same way
// everywhere — the CLI envelope renders kind + suggestions. Pure factory (no class —
// factory-functions rule); imports nothing, imported by config · store · tiers.
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
