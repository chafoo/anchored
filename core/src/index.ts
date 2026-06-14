// src/index.ts — the public entry of the core package (the one permitted index.ts:
// the package interface, not a folder-internal barrel). It re-exports the public
// surface from the orchestrator in cli/. The assembly itself lives in cli/anchored.ts
// (createAnchored = the single composition root); the runtime/bin wiring lives in
// src/bin.ts. Consumers import from here; everything internal is reached through the
// orchestrator.
export {
  createAnchored,
  buildCli,
  tierOfNode,
  type Anchored,
  type AnchoredDeps,
  type AnchoredWiring,
  type WireDeps,
} from './cli/anchored.js'
export type { NodeOpsFacade } from './cli/cli.js'
export type { Config } from './services/config/config-schema/config.js'
