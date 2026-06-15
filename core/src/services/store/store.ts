// _v3/services/store/store.ts — THE substrate service. createStore({fs,lock,yaml,…}) → a dumb
// StorePort: load/persist a node SAFELY, validated against the schema YOU give it. Knows no
// tier, no evidence, no transition — the schema is the law. read = fs.readFile → yaml.parse →
// schema.parse ; write = schema.parse → yaml.stringify → safe-write (lock+CAS). The CAS version
// rides the node on a symbol key (invisible to schema + yaml) from read → write.
import { dirname } from 'node:path'
import type { FileSystem, Lock, Yaml } from '../../lib/contracts/fs.js'
import type { StorePort, Node, Schema } from '../../lib/contracts/store.js'
import { safeWrite } from './scope/safe-write.js'

const VERSION = Symbol('anchored.version')

export interface StoreDeps {
  fs: FileSystem
  lock: Lock
  yaml: Yaml
  /** slug → node-file path. The layout (incl. tier-awareness) is bound by the cli assembly. */
  pathFor: (slug: string) => string
  /** slug → the archive move pair {from → to}. INJECTED policy (an epic moves a folder, a task
   *  a file) — the dumb store just renames `from` to `to`. */
  archivePathFor: (slug: string) => { from: string; to: string }
  /** temp-file uniqueness seams (injected effects). */
  rand: () => string
  pid: () => number
}

export function createStore(deps: StoreDeps): StorePort {
  const { fs, lock, yaml, pathFor, archivePathFor, rand, pid } = deps

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

    async archive(slug): Promise<void> {
      const { from, to } = archivePathFor(slug)
      await fs.mkdir(dirname(to), { recursive: true })
      await fs.rename(from, to)
    },

    async remove(slug): Promise<void> {
      await fs.unlink(pathFor(slug))
    },
  }
}
