// _v3/cli/scope/render-line.ts — the single agent-format line renderer (F1/F3). Turns an
// Envelope into ONE dense, readable line: no ANSI, nothing truncated, full values. This is the
// DEFAULT output (AI-only — there is no human mode and no env-detection; anchored is always
// agent-driven, so the agent format simply IS the default). `--json` bypasses this and emits the
// raw envelope instead (handled in cli.ts). Pure `(env) => string`, the only consumer is the
// `emit` chokepoint in cli.ts. cli-local: a transport-format helper of the cli factory.
import type { Envelope } from '../envelope.js'

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// render a scalar verbatim (full value, no truncation); objects/arrays compact to JSON so the
// line stays one line while still carrying everything.
function val(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

// the headline of a success line: the most identifying fields of the result node, in order, so
// the orchestrator reads state without parsing. Falls back to a compact JSON of the whole result
// for shapes we don't special-case (still one line, still complete).
function summarize(result: unknown): string {
  if (result === null || result === undefined) return 'ok'
  if (!isObj(result)) return val(result)
  const r = result
  const parts: string[] = []
  // a stage-plan wraps the node — surface the stage + the node it planned for.
  if (isObj(r.node) && (r.stage || r.steps)) {
    if (r.stage) parts.push(`stage: ${val(r.stage)}`)
    const n = r.node as Record<string, unknown>
    if (n.slug) parts.push(`node: ${val(n.slug)}`)
    if (n.status) parts.push(`status: ${val(n.status)}`)
    if (Array.isArray(r.steps)) parts.push(`steps: ${(r.steps as unknown[]).length}`)
    return parts.join(' · ')
  }
  if (r.slug) parts.push(`slug: ${val(r.slug)}`)
  if (r.status) parts.push(`status: ${val(r.status)}`)
  if (r.archived) parts.push('archived')
  if (r.reset) parts.push('reset')
  // collection-shaped results: count the salient arrays so a write is legible at a glance.
  if (Array.isArray(r.phases)) parts.push(`phases: ${r.phases.length}`)
  if (Array.isArray(r.tasks)) parts.push(`tasks: ${r.tasks.length}`)
  if (Array.isArray(r.acceptance)) parts.push(`acceptance: ${r.acceptance.length}`)
  if (Array.isArray(r.acceptance_criteria))
    parts.push(`ac: ${(r.acceptance_criteria as unknown[]).length}`)
  if (Array.isArray(r.children))
    parts.push(`children: ${(r.children as unknown[]).map((c) => val(c)).join(', ')}`)
  if (parts.length > 0) return parts.join(' · ')
  // unknown shape — keep the line complete with a compact JSON (still one line, nothing dropped).
  return JSON.stringify(r)
}

/** Render an envelope as one dense readable line — the default (non-`--json`) output. */
export function renderLine(env: Envelope): string {
  if (!env.ok) {
    const e = env.error
    const head = `error[${e?.name ?? 'Error'}]: ${e?.message ?? 'failed'}`
    const fix =
      e?.suggestions && e.suggestions.length > 0 ? ` · fix: ${e.suggestions.join('; ')}` : ''
    return `${env.command} · ${head}${fix}`
  }
  const body = summarize(env.result)
  const next = env.next ? ` · next: ${env.next}` : ''
  return `${env.command} · ${body}${next}`
}
