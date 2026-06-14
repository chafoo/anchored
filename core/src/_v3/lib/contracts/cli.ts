// _v3/lib/contracts/cli.ts — the root cli surface + the assembled engine (bin↔cli).
// `createCli` (the single composition root) wires the two services into the tier factories
// and returns this. `run(argv)` dispatches `<tier> <verb>` and emits one JSON envelope per
// call. Interface-only.
import type { TemplatePort } from './template.js'

/** The root dispatcher: argv in, process exit-code out (one JSON envelope emitted). */
export interface Cli {
  run(argv: string[]): Promise<number>
}

/** The assembled engine: the cli plus the loaded template (for host inspection). */
export interface Anchored extends Cli {
  template: TemplatePort
}
