// services/store/store.ts — THE substrate service. createStore({fs,lock,yaml,…}) → a dumb
// StorePort: load/persist a run file SAFELY, validated against the schema YOU give it. Knows
// no criteria, no evidence, no gates — the schema is the law. read = fs.readFile → yaml.parse →
// schema.parse ; write = schema.parse → yaml.stringify → safe-write (lock+CAS). The CAS version
// rides the node on a symbol key (invisible to schema + yaml) from read → write.
import type { FileSystem, Lock, Yaml } from '../../lib/contracts/fs.js'
import type { StorePort, Node, Schema } from '../../lib/contracts/store.js'
import { safeWrite } from './scope/safe-write.js'

const VERSION = Symbol('anchored.version')

export interface StoreDeps {
  fs: FileSystem
  lock: Lock
  yaml: Yaml
  /** slug → run-file path (`.claude/anchored/<slug>.yml`) — bound by the cli assembly. */
  pathFor: (slug: string) => string
  /** the runs directory (for list) — bound by the cli assembly. */
  runsDir: string
  /** temp-file uniqueness seams (injected effects). */
  rand: () => string
  pid: () => number
}

export function createStore(deps: StoreDeps): StorePort {
  const { fs, lock, yaml, pathFor, runsDir, rand, pid } = deps

  return {
    async read(slug, schema: Schema): Promise<Node> {
      const path = pathFor(slug)
      const data = yaml.parse(await fs.readFile(path), { maxAliasCount: 0 })
      const node = schema.parse(data) as Node
      if (fs.stat) {
        const v = await fs.stat(path)
        if (v !== undefined) (node as Record<symbol, unknown>)[VERSION] = v
      }
      return node
    },

    async write(slug, node: Node, schema: Schema): Promise<Node> {
      schema.parse(node) // fail-closed: an invalid mutation never reaches disk
      const content = yaml.stringify(node, { lineWidth: 0 })
      const expectedVersion = (node as Record<symbol, unknown>)[VERSION] as string | undefined
      await safeWrite({ fs, lock, rand, pid }, pathFor(slug), content, expectedVersion)
      return node
    },

    async list(): Promise<string[]> {
      let entries: string[]
      try {
        entries = await fs.readdir(runsDir)
      } catch {
        return [] // no runs dir yet — no runs
      }
      return entries
        .filter((f) => f.endsWith('.yml') && !f.includes('.tmp.'))
        .map((f) => f.slice(0, -'.yml'.length))
        .sort()
    },
  }
}
