// _v3/cli/scope/read-stdin-arg.ts — the G2/G3 `-` convention (pure, with one injected reader).
// A positional `-` means "read THIS value from stdin" (like `kubectl apply -f -` / `gh pr create
// --body-file -`). It reads EXACTLY ONE value — the body/payload — never identifiers (those stay
// words, G1). For a single big value (G2: evidence text, refine prose) the stdin string replaces
// the `-` slot verbatim; the tier verb receives it as a normal positional. For a bulk verb (G3:
// `task phase add <slug> -`) the SAME substitution feeds a JSON string the tier verb parses +
// Zod-validates (G4 — validation stays in the tier/schema, not here). So this helper only does
// the channel swap; it neither parses nor validates. cli-local: an input-format helper of the
// cli factory, given `rest` + the injected `readStdin` seam.

/**
 * Replace the first `-` positional in `rest` with the stdin value. Only one `-` is honoured (the
 * body channel reads exactly one value); a second `-` is left untouched (it is then a literal).
 * Returns `rest` unchanged when no `-` is present, so the common identifier-only call never reads
 * stdin.
 */
export function readStdinArg(rest: string[], readStdin: () => string): string[] {
  const i = rest.indexOf('-')
  if (i < 0) return rest
  const body = readStdin()
  return rest.map((a, idx) => (idx === i ? body : a))
}
