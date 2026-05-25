#!/usr/bin/env node
/**
 * `anchored` CLI binary — entry point.
 *
 * Wires up commander.js sub-commands that thin-wrap the service-layer
 * ops in src/ops/. Intended use:
 *   - Humans for ad-hoc operations
 *   - Shell hooks (`run:` steps in anchored.yml) for scripting
 *
 * For agent use, prefer the MCP server (src/mcp/server.ts) which
 * exposes the same ops as typed tools.
 */

import { Command } from 'commander';

import { registerPhaseCommand } from './commands/phase.js';
import { registerAcCommand } from './commands/ac.js';
import { registerContextCommand } from './commands/context.js';
import { registerFieldCommand } from './commands/field.js';
import { registerTaskCommand } from './commands/task.js';

const program = new Command();

program
  .name('anchored')
  .description(
    'CLI for the anchored Claude Code plugin — typed task-file mutations',
  )
  .version('0.2.0-alpha.0')
  .option(
    '-r, --root <path>',
    'project root (defaults to current directory)',
    process.cwd(),
  );

registerTaskCommand(program);
registerPhaseCommand(program);
registerAcCommand(program);
registerContextCommand(program);
registerFieldCommand(program);

// Top-level help
program.addHelpText(
  'after',
  `
Examples:
  $ anchored task read my-task
  $ anchored task status set my-task wrap
  $ anchored phase status set my-task token-storage-layer done
  $ anchored phase next-pending my-task
  $ anchored ac evidence set my-task token-storage-layer 0 "src/store.ts:42 — TokenStore added"
  $ anchored phase field set my-task token-storage-layer commit abc1234
  $ anchored context append my-task Build Implement "- token-storage-layer / Token Storage Layer\\n  switched library mid-flight"

All mutations validate against the task-file schema + state machine.
Errors surface as exit code 1 with a clear message; reads exit 0.
`,
);

try {
  await program.parseAsync(process.argv);
} catch (err: unknown) {
  // commander already prints its own errors for arg-parsing issues;
  // we catch op-level errors here (InvalidTransition, NotFound, etc.)
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`anchored: ${message}\n`);
  process.exit(1);
}
