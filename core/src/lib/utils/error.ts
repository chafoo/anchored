// _v3/lib/utils/error.ts — the shared typed-error primitive. The ONE util: every layer
// throws an AnchoredError (kind + suggestions) so a rejected op reads the same everywhere
// and the cli envelope renders kind + suggestions. Pure factory (no class), imports nothing.
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
