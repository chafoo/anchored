// _v3/cli/scope/render-line.ts — the single agent-format line renderer (F1/F3). Turns an
// Envelope into ONE dense, readable line: no ANSI, nothing truncated, full values. This is the
// DEFAULT output (AI-only — there is no human mode and no env-detection; anchored is always
// agent-driven, so the agent format simply IS the default). `--json` bypasses this and emits the
// raw envelope instead (handled in cli.ts). Pure `(env) => string`, the only consumer is the
// `emit` chokepoint in cli.ts. cli-local: a transport-format helper of the cli factory.
import type { Envelope } from '../envelope.js'

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isScalar = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

// the node count-arrays (and the children list): their presence marks a NODE result, which goes
// through summarize(), never the generic collection-item path.
const NODE_ARRAY_FIELDS = ['phases', 'tasks', 'acceptance', 'acceptance_criteria', 'children']

// the free-text field of a collection item: rendered BARE and LAST (no label), in this preference
// order. `text` (question/ac) · `goal` (child) · then the looser note/answer/detail variants.
const TEXT_FIELDS = ['text', 'goal', 'note', 'answer', 'detail']

// the identifier of a collection item: rendered BARE and FIRST (no label), `id` preferred.
const ID_FIELDS = ['id', 'slug']

// the scalar fields that lead the labelled middle, in this fixed order, before the remaining
// scalars in insertion order — so `status`/`priority` always read first.
const LEAD_FIELDS = ['status', 'priority']

// a collection item is a plain object that is NOT a node and NOT a stage-plan: it either carries
// an `id`, or it has a free-text field (text/goal/…) and none of the node count-arrays. This is
// the conservative structural gate — a `child get` ({slug,status,goal}) is an item (text-like, no
// node arrays), while a real node ({slug,status,phases:[…]}) stays on the summarize() path.
function isItem(v: unknown): v is Record<string, unknown> {
  if (!isObj(v)) return false
  // stage-plan ({node,stage|steps}) is a node-bearing shape — not an item.
  if (isObj(v.node) && (v.stage !== undefined || v.steps !== undefined)) return false
  // any node count-array present → it's a node result, render via summarize().
  if (NODE_ARRAY_FIELDS.some((f) => Array.isArray(v[f]))) return false
  if (typeof v.id === 'string') return true
  // no id: only an item if it has a free-text field to lead-and-trail around.
  return TEXT_FIELDS.some((f) => isScalar(v[f]))
}

// one dense readable line for a generic collection item: `<id|slug> · status: … · priority: … ·
// <key: value>* · <text>`. Reproduces the question format `q1 · status: open · priority: high ·
// <text>` exactly, while working for any collection's shape.
function itemLine(item: Record<string, unknown>): string {
  const used = new Set<string>()
  const parts: string[] = []

  // 1. identifier, BARE and first.
  const idField = ID_FIELDS.find((f) => isScalar(item[f]))
  if (idField) {
    parts.push(val(item[idField]))
    used.add(idField)
  }

  // 3. reserve the free-text field for LAST (bare) — pick it before the middle so it never
  // appears labelled in the middle.
  const textField = TEXT_FIELDS.find((f) => isScalar(item[f]))
  if (textField) used.add(textField)

  // 2. the labelled middle: status/priority first, then the rest of the scalar fields in
  // insertion order. Non-scalars compact to JSON via val() so the line stays one line.
  const ordered = [
    ...LEAD_FIELDS.filter((f) => f in item && !used.has(f)),
    ...Object.keys(item).filter((f) => !used.has(f) && !LEAD_FIELDS.includes(f)),
  ]
  for (const f of ordered) {
    if (used.has(f)) continue
    used.add(f)
    if (item[f] === null || item[f] === undefined) continue
    parts.push(`${f}: ${val(item[f])}`)
  }

  // 3 (cont.). the free-text field, BARE and last.
  if (textField) parts.push(val(item[textField]))

  return parts.join(' · ')
}

// render a scalar verbatim (full value, no truncation); objects/arrays compact to JSON so the
// line stays one line while still carrying everything.
function val(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (isScalar(v)) return String(v)
  return JSON.stringify(v)
}

// the headline of a success line: the most identifying fields of the result node, in order, so
// the orchestrator reads state without parsing. Falls back to a compact JSON of the whole result
// for shapes we don't special-case (still one line, still complete).
function summarize(result: unknown): string {
  if (result === null || result === undefined) return 'ok'
  // a single collection item (`<coll> get`) renders as its dense line.
  if (isItem(result)) return itemLine(result)
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
  // a list result (`<coll> list`) is an ARRAY of items → one agent-line PER item, each prefixed
  // by the command — so the orchestrator reads the collection without parsing JSON. Generic over
  // every collection (ac · child · concern · rule · question · phase · log …).
  if (Array.isArray(env.result)) {
    if (env.result.length === 0) return `${env.command} · (none)`
    return env.result
      .map((it) => `${env.command} · ${isItem(it) ? itemLine(it) : val(it)}`)
      .join('\n')
  }
  const body = summarize(env.result)
  const next = env.next ? ` · next: ${env.next}` : ''
  return `${env.command} · ${body}${next}`
}
