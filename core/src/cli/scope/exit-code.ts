// cli/scope/exit-code.ts — error → meaningful exit code. 0 ok · 2 refused (a typed
// AnchoredError or a schema violation — the caller did something the mechanism rejects) ·
// 3 write contention (retryable — re-read and retry) · 1 anything else.
export function exitCodeFor(e: unknown): number {
  if (e instanceof Error && 'kind' in e)
    return (e as { kind: string }).kind === 'WriteContention' ? 3 : 2
  if (typeof e === 'object' && e !== null && 'issues' in e) return 2
  return 1
}
