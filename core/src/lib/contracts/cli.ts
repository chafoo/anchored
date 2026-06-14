// contracts/cli.ts — the root cli surface + the assembled engine. `createAnchored`
// (in cli/cli.ts, the single assembly point) wires the service implementations into
// the tier modules and returns this. `run(argv)` dispatches `<tier>` → tier.cli.run
// and emits one JSON envelope per call. Interface-only.
import type { ConfigPort } from './config.js'

/** The root dispatcher: argv in, process exit-code out (one JSON envelope emitted). */
export interface Cli {
  run(argv: string[]): Promise<number>
}

/** The assembled engine: the cli plus the loaded config (for host inspection). */
export interface Anchored {
  run(argv: string[]): Promise<number>
  config: ConfigPort
}
