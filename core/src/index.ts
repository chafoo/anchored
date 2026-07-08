// Package entry — the one permitted index.ts (the public package interface). Re-exports
// the composition root + the boundary types (see docs/design/north-star.md).
export { createCli, type CliDeps } from './cli/cli.js'
export type { Cli } from './lib/contracts/cli.js'
export type { RunPort, ValidationPacket, AnchorInput, AmendInput } from './lib/contracts/run.js'
export type { Envelope } from './cli/envelope.js'
export type { RunFile, Criterion, Evidence, Rigor } from './modules/run/run.schemas.js'
