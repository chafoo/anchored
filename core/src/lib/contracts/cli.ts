// lib/contracts/cli.ts — the root cli surface (bin ↔ cli). `createCli` (the single
// composition root) wires store + config into the run module and returns this. `run(argv)`
// dispatches the 9 flat verbs and emits one JSON envelope per call. Interface-only.

/** The root dispatcher: argv in, process exit-code out (one JSON envelope emitted). */
export interface Cli {
  run(argv: string[]): Promise<number>
}
