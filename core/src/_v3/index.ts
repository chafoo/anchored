// _v3/index.ts — the package entry: re-exports the public surface (createCli + the port
// types) from cli/. The assembly lives in cli/cli.ts; the runtime/bin wiring in bin.ts.
export { createCli, type CliDeps } from './cli/cli.js'
export type { Anchored, Cli } from './lib/contracts/cli.js'
export type { Tier } from './lib/contracts/tier.js'
export type { Envelope } from './cli/envelope.js'
