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
    case 'set-field':
      return ops.setField(need(0, 'slug'), need(1, 'field'), need(2, 'value'))
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
    case 'set-failures':
      // gate rejects an AC: write failures + flip it back to pending (re-do loop)
      return ops.setChildFailures(need(0, 'slug'), need(1, 'phase'), need(2, 'ac'), need(3, 'text'))
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
      ])
  }
}
