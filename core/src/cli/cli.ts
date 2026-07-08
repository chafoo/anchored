// cli/cli.ts — createCli(deps) → Cli. The SINGLE composition root: binds the path layout,
// wires fs/lock/yaml into the store, loads anchored.yml into the config service (lazily,
// once), assembles the run module, and dispatches the 9 flat verbs. Hand-rolled argv
// parsing (nine verbs need no framework); one JSON envelope per call; the CLI never
// spawns — `validate` only returns the packet.
import { join } from 'node:path'
import type { FileSystem, Lock, Yaml } from '../lib/contracts/fs.js'
import type { Cli } from '../lib/contracts/cli.js'
import type { RunPort, AnchorInput, AmendInput } from '../lib/contracts/run.js'
import { anchoredError } from '../lib/utils/error.js'
import { createStore } from '../services/store/store.js'
import { createConfig } from '../services/config/config.js'
import { createRun } from '../modules/run/run.js'
import { okEnvelope, errEnvelope } from './envelope.js'
import { exitCodeFor } from './scope/exit-code.js'
import { runsDir, runPathFor } from './scope/run-path.js'
import { parseBody } from './scope/parse-body.js'

export interface CliDeps {
  fs: FileSystem
  lock: Lock
  yaml: Yaml
  projectRoot: string
  clock: () => string
  rand: () => string
  pid: () => number
  out: (line: string) => void
  readStdin: () => Promise<string>
  version: string
}

const USAGE = {
  anchor: 'anchored anchor <slug>            (body via stdin: goal, plan?, rigor?, criteria)',
  claim: 'anchored claim <slug> <text> [--refs c1,c2]',
  amend: 'anchored amend <slug>             (body via stdin: reason, add?, supersede?, reject?)',
  validate: 'anchored validate <slug> [--gate <g>] [--snapshot <ref>]',
  evidence:
    'anchored evidence <slug> <criterion> --snapshot <s> [--grounded <proof>] [--verdict <v>]',
  fail: 'anchored fail <slug> <criterion> --snapshot <s> --verdict <v>',
  set: 'anchored set <slug> <criterion> <field> <value>   (or <field>=<value>)',
  status: 'anchored status [slug]            (no slug: summaries of every run)',
  close: 'anchored close <slug>',
  version: 'anchored version',
} as const

interface Parsed {
  positional: string[]
  flags: Record<string, string>
}

function parseArgs(rest: string[], verb: string): Parsed {
  const positional: string[] = []
  const flags: Record<string, string> = {}
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      if (eq > 2) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1)
      } else {
        const value = rest[i + 1]
        if (value === undefined || value.startsWith('--'))
          throw anchoredError('Usage', `${verb}: flag ${arg} needs a value`, [
            USAGE[verb as keyof typeof USAGE],
          ])
        flags[arg.slice(2)] = value
        i++
      }
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

function need(parsed: Parsed, verb: string, count: number): string[] {
  if (parsed.positional.length < count)
    throw anchoredError('Usage', `${verb}: missing arguments`, [USAGE[verb as keyof typeof USAGE]])
  return parsed.positional
}

export function createCli(deps: CliDeps): Cli {
  const { fs, lock, yaml, projectRoot, clock, rand, pid, out, readStdin, version } = deps

  const store = createStore({
    fs,
    lock,
    yaml,
    pathFor: runPathFor(projectRoot),
    runsDir: runsDir(projectRoot),
    rand,
    pid,
  })

  let runPort: RunPort | undefined
  const assemble = async (): Promise<RunPort> => {
    if (runPort !== undefined) return runPort
    let raw: unknown
    try {
      raw = yaml.parse(await fs.readFile(join(projectRoot, 'anchored.yml')), { maxAliasCount: 0 })
    } catch {
      raw = undefined // no anchored.yml — the built-in defaults ARE the behavior
    }
    runPort = createRun({ store, config: createConfig(raw), clock, rand })
    return runPort
  }

  const dispatch = async (verb: string, parsed: Parsed): Promise<unknown> => {
    const run = await assemble()
    switch (verb) {
      case 'anchor': {
        const [slug] = need(parsed, verb, 1)
        const body = parseBody(yaml, await readStdin(), verb)
        return run.anchor({ ...body, slug } as unknown as AnchorInput)
      }
      case 'claim': {
        const [slug, text] = need(parsed, verb, 2)
        const refs = parsed.flags['refs']?.split(',').map((r) => r.trim())
        return run.claim(slug!, { claim: text!, ...(refs !== undefined ? { refs } : {}) })
      }
      case 'amend': {
        const [slug] = need(parsed, verb, 1)
        const body = parseBody(yaml, await readStdin(), verb)
        return run.amend(slug!, body as unknown as AmendInput)
      }
      case 'validate': {
        const [slug] = need(parsed, verb, 1)
        return run.validate(slug!, {
          ...(parsed.flags['gate'] !== undefined ? { gate: parsed.flags['gate'] } : {}),
          ...(parsed.flags['snapshot'] !== undefined ? { snapshot: parsed.flags['snapshot'] } : {}),
        })
      }
      case 'evidence':
      case 'fail': {
        const [slug, criterion] = need(parsed, verb, 2)
        const snapshot = parsed.flags['snapshot']
        if (snapshot === undefined)
          throw anchoredError(
            'Usage',
            `${verb}: --snapshot is required (from the validation packet)`,
            [USAGE[verb]],
          )
        const grounded = parsed.flags['grounded']
        const verdict = parsed.flags['verdict']
        if (verb === 'fail') {
          if (verdict === undefined)
            throw anchoredError('Usage', 'fail: --verdict is required (a reasoned rejection)', [
              USAGE.fail,
            ])
          return run.fail(slug!, criterion!, { snapshot, verdict })
        }
        return run.evidence(slug!, criterion!, {
          snapshot,
          ...(grounded !== undefined ? { grounded } : {}),
          ...(verdict !== undefined ? { verdict } : {}),
        })
      }
      case 'set': {
        const positional = need(parsed, verb, 3)
        const [slug, criterion] = positional
        let field = positional[2]!
        let value = positional[3]
        const eq = field.indexOf('=')
        if (eq > 0 && value === undefined) {
          value = field.slice(eq + 1)
          field = field.slice(0, eq)
        }
        if (value === undefined) throw anchoredError('Usage', 'set: missing value', [USAGE.set])
        return run.set(slug!, criterion!, field, value)
      }
      case 'status': {
        const slug = parsed.positional[0]
        return slug === undefined ? run.list() : run.status(slug)
      }
      case 'close': {
        const [slug] = need(parsed, verb, 1)
        return run.close(slug!)
      }
      case 'version':
      case '--version':
        return { version }
      case 'help':
      case '--help':
        return { usage: USAGE }
      default:
        throw anchoredError('Usage', `unknown verb '${verb}'`, Object.values(USAGE))
    }
  }

  return {
    async run(argv: string[]): Promise<number> {
      const [verb, ...rest] = argv
      const command = verb ?? 'help'
      try {
        if (verb === undefined)
          throw anchoredError('Usage', 'a verb is required', Object.values(USAGE))
        const result = await dispatch(verb, parseArgs(rest, verb))
        out(JSON.stringify(okEnvelope(command, result)))
        return 0
      } catch (e) {
        out(JSON.stringify(errEnvelope(command, e)))
        return exitCodeFor(e)
      }
    },
  }
}
