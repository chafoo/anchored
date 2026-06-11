// cli/commands/node.ts — generic, tier-generic node verbs agents drive via Bash.
// Each verb maps to exactly one nodeOps facade call (no direct FS/parser here).
// The hard invariant lives in the substrate: a nodeOps error (e.g. done without
// evidence) is caught upstream and rendered as an error envelope — never re-checked
// in the CLI.
import { cliError, type CliDeps } from '../index.js'

export async function nodeCommand(args: string[], deps: CliDeps): Promise<unknown> {
  const verb = args[0]
  const a = args.slice(1)
  const need = (i: number, name: string): string => {
    const v = a[i]
    if (v === undefined) throw cliError('MissingArgument', `missing argument: ${name}`)
    return v
  }
  const ops = deps.nodeOps
  switch (verb) {
    case 'create':
      return ops.create(need(0, 'slug'), {})
    case 'read':
      return ops.read(need(0, 'slug'))
    case 'set-status':
      return ops.setStatus(need(0, 'slug'), need(1, 'status'))
    case 'add-child':
      return ops.addChild(need(0, 'slug'), { slug: need(1, 'child-slug'), goal: a[2] })
    case 'next-child':
      return ops.nextChild(need(0, 'slug'))
    case 'ready-children':
      // q8: ALL children runnable right now (pending + deps done) — the fan-out
      // batch for the epic build loop (independent child-tasks built in parallel).
      return ops.readyChildren(need(0, 'slug'))
    case 'list-phases': {
      // convenience: the phases[] array of a node (read + extract)
      const n = (await ops.read(need(0, 'slug'))) as { phases?: unknown }
      return n.phases ?? []
    }
    case 'question-list': {
      // convenience (G6): a node's questions[], optionally filtered by status —
      // `question-list <slug> open` or `question-list <slug> --status open`. Stops
      // agents shelling out to python-yaml just to read the open questions.
      const n = (await ops.read(need(0, 'slug'))) as { questions?: { status: string }[] }
      const qs = n.questions ?? []
      const status = a[1] === '--status' ? a[2] : a[1]
      return status ? qs.filter((q) => q.status === status) : qs
    }
    case 'add-question':
      return ops.addQuestion(need(0, 'slug'), { text: need(1, 'text'), priority: a[2] ?? 'medium' })
    case 'resolve-question':
      // resolve-question <slug> <id> <answer> [source] [reasoning] — source=ai needs reasoning
      return ops.resolveQuestion(need(0, 'slug'), need(1, 'id'), {
        answer: need(2, 'answer'),
        source: a[3] ?? 'ai',
        ...(a[4] !== undefined ? { reasoning: a[4] } : {}),
      })
    case 'append-log':
      return ops.appendLog(need(0, 'slug'), {
        at: need(1, 'at'),
        kind: need(2, 'kind'),
        note: need(3, 'note'),
      })
    case 'set-field': {
      const field = need(1, 'field')
      let value = need(2, 'value')
      // H5: a multi-line context trail passed via the CLI arrives with LITERAL '\n'
      // (bash double-quotes don't expand escapes) → normalize to real newlines for
      // the context.* trails, so the renderer emits a readable block scalar instead
      // of one long escaped line.
      if (field.split('.')[0] === 'context') value = value.replace(/\\n/g, '\n')
      return ops.setField(need(0, 'slug'), field, value)
    }
    case 'set-executor':
      return ops.setExecutor(need(0, 'slug'), need(1, 'phase'), need(2, 'value'))
    case 'add-evidence':
      return ops.addEvidence(need(0, 'slug'), need(1, 'ac'), need(2, 'text'))
    case 'add-phase':
      return ops.addPhase(need(0, 'slug'), { slug: need(1, 'phase-slug'), name: a[2] })
    case 'add-ac':
      // add-ac <slug> <phase> <text> — id auto-assigned (a1, a2, …)
      return ops.addAc(need(0, 'slug'), need(1, 'phase'), { text: need(2, 'text') })
    case 'add-phase-evidence':
      return ops.addChildEvidence(need(0, 'slug'), need(1, 'phase'), need(2, 'ac'), need(3, 'text'))
    case 'set-child-status':
      return ops.setChildStatus(need(0, 'slug'), need(1, 'child'), need(2, 'status'))
    case 'set-phase-rules':
      return ops.setPhaseRules(need(0, 'slug'), need(1, 'phase'), need(2, 'path'), need(3, 'why'))
    case 'set-failures':
      // gate rejects an AC: write failures + flip it back to pending (re-do loop)
      return ops.setChildFailures(need(0, 'slug'), need(1, 'phase'), need(2, 'ac'), need(3, 'text'))
    case 'clear-failures':
      // H4: retire an AC's transient failures (status untouched) — the manual
      // escape hatch; the redo done-flip clears failures automatically anyway
      return ops.clearChildFailures(need(0, 'slug'), need(1, 'phase'), need(2, 'ac'))
    case 'set-ac-status':
      return ops.setChildAcStatus(
        need(0, 'slug'),
        need(1, 'phase'),
        need(2, 'ac'),
        need(3, 'status'),
      )
    default:
      throw cliError('UnknownNodeVerb', `unknown node verb '${verb ?? ''}'`, [
        'create',
        'read',
        'set-status',
        'add-evidence',
        'add-phase',
        'add-ac',
        'add-phase-evidence',
        'set-executor',
        'next-child',
        'ready-children',
        'set-failures',
        'clear-failures',
        'list-phases',
        'question-list',
        'add-question',
        'resolve-question',
      ])
  }
}
