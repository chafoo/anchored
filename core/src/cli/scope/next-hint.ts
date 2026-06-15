// _v3/cli/scope/next-hint.ts — the F2 `next:` computation (pure). Given the verb's command +
// its result NODE, derive the single most useful next action the orchestrator should take, so
// the readable line carries the next step pre-parameterised and the loop never needs a second
// "what's next?" call. This is NOT new mechanism — it only reads the legal forward transition
// (already encoded in transitions.ts) and the ready-child rule (children.ts) off the returned
// node. Heuristic + best-effort: an unknown shape simply yields no hint (undefined), never an
// error. cli-local: the hint is a transport-format concern, single consumer (render-line).
import { lifecycleTransitions, phaseTransitions } from '../../modules/shared/transitions.js'
import { nextChild, readyChildren, type ChildLike } from '../../modules/shared/children.js'

interface AcLike {
  id: string
  status: string
}
interface NodeShape {
  slug?: string
  status?: string
  phases?: ChildLike[]
  tasks?: ChildLike[]
  acceptance_criteria?: AcLike[]
  acceptance?: AcLike[]
  // a stage-plan result wraps the node under `.node`.
  node?: NodeShape
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// the legal forward stages for a lifecycle node, minus the `drafted` re-entry edge (a hint
// suggests forward motion, not the backward update-mode loop).
function stageHint(status: string): string | undefined {
  const fwd = (lifecycleTransitions[status] ?? []).filter((s) => s !== 'drafted')
  return fwd.length > 0 ? `status → ${fwd.join(' | ')}` : undefined
}

// the next runnable child (an in-flight one wins for resume-safety, else the first ready), with
// the full ready batch in parentheses so a fan-out is visible in one line.
function childHint(label: string, children: ChildLike[]): string | undefined {
  const next = nextChild(children)
  if (!next) {
    const open = children.filter((c) => !['done', 'deferred'].includes(c.status))
    return open.length === 0 && children.length > 0 ? `all ${label} terminal` : undefined
  }
  const ready = readyChildren(children).map((c) => c.slug)
  const batch = ready.length > 1 ? ` (ready: ${ready.join(', ')})` : ''
  return `${label} → ${next.slug}${batch}`
}

// the pending acceptance criteria on a phase (the work still to evidence before it can be done).
function acHint(acs: AcLike[]): string | undefined {
  const open = acs.filter((a) => !['done', 'deferred'].includes(a.status)).map((a) => a.id)
  return open.length > 0 ? `evidence: ${open.join(', ')}` : undefined
}

/**
 * Compute the `next:` hint for a command's result NODE, or undefined when nothing useful applies.
 * Reads only already-legal transitions/ready-rules off the returned node — pure, no effects.
 */
export function nextHint(result: unknown): string | undefined {
  if (!isObj(result)) return undefined
  const node = result as NodeShape
  // a stage-plan (`plan`/`refine`/`build`/`wrap`) carries the node under `.node`.
  const subject: NodeShape = isObj(node.node) ? node.node : node

  // a phase: surface the criteria still to evidence, then the lifecycle edge if terminal-ready.
  if (Array.isArray(subject.acceptance_criteria)) {
    const ac = acHint(subject.acceptance_criteria)
    if (ac) return ac
    const edges = subject.status ? phaseTransitions[subject.status] : undefined
    if (edges) return edges.length > 0 ? `status → ${edges.join(' | ')}` : 'phase terminal'
  }

  // a task: point at the next phase to work; fall back to the lifecycle edge.
  if (Array.isArray(subject.phases)) {
    const child = childHint('phase', subject.phases)
    if (child && !child.startsWith('all')) return child
    if (subject.status) return stageHint(subject.status) ?? child
    return child
  }

  // an epic: point at the next child stub; fall back to the lifecycle edge.
  if (Array.isArray(subject.tasks)) {
    const child = childHint('child', subject.tasks)
    if (child && !child.startsWith('all')) return child
    if (subject.status) return stageHint(subject.status) ?? child
    return child
  }

  // a bare lifecycle node (no children array surfaced): just the legal forward stages.
  if (typeof subject.status === 'string' && lifecycleTransitions[subject.status])
    return stageHint(subject.status)

  return undefined
}
