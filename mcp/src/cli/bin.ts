/**
 * `anchored` CLI binary — entry point.
 *
 * Wires up commander.js sub-commands that thin-wrap the V0.2 ops
 * factory (`createOps` at src/core/factory.ts). Intended use:
 *   - Humans for ad-hoc operations
 *   - Shell hooks (`run:` steps in anchored.yml) for scripting
 *
 * For agent use, prefer the MCP server (src/mcp/server.ts) which
 * exposes the same ops as typed tools.
 *
 * The CLI groups commands by domain (task / context / phase / ac /
 * field) and mirrors the 33-tool MCP surface 1:1. Each command file
 * registers its subtree onto the top-level program here.
 */

import { Command } from 'commander';

import { registerTaskCommands } from './commands/task.js';
import { registerContextCommands } from './commands/context.js';
import { registerPhaseCommands } from './commands/phase.js';
import { registerAcCommands } from './commands/ac.js';
import { registerFieldCommands } from './commands/field.js';

const program = new Command();

program
  .name('anchored')
  .description(
    'CLI for the anchored Claude Code plugin — typed task-file mutations',
  )
  .version('0.2.0');

registerTaskCommands(program);
registerContextCommands(program);
registerPhaseCommands(program);
registerAcCommands(program);
registerFieldCommands(program);

// Top-level help
program.addHelpText(
  'after',
  `
Examples:
  $ anchored task create demo-cli --title "Demo task"
  $ anchored task read demo-cli
  $ anchored phase add demo-cli --name "Setup" --slug setup
  $ anchored ac add demo-cli setup --text "First criterion"
  $ anchored ac evidence set demo-cli setup 0 "src/foo.ts:14 — handler in place"
  $ anchored phase status set demo-cli setup done
  $ anchored phase next demo-cli

All mutations validate against the task-file schema + state machine.
Errors exit 1 with a clear message and structured suggestions; reads exit 0.
`,
);

try {
  await program.parseAsync(process.argv);
} catch (err: unknown) {
  // commander already prints its own errors for arg-parsing issues;
  // we catch op-level errors here (InvalidTransition, NotFound, etc.)
  printError(err);
  process.exit(1);
}

/**
 * Format and print a typed error with structured recovery suggestions.
 *
 * Layout:
 *   anchored: <error message>
 *
 *   Suggestions:
 *     - first suggestion
 *     - second suggestion
 *
 * ANSI color codes added when stderr is a TTY; stripped when piped
 * so logs / scripted callers get clean plain text.
 */
function printError(err: unknown): void {
  const isTTY = process.stderr.isTTY === true;
  const RED = isTTY ? '[31m' : '';
  const BOLD = isTTY ? '[1m' : '';
  const DIM = isTTY ? '[2m' : '';
  const RESET = isTTY ? '[0m' : '';

  const errorName =
    err instanceof Error && err.name && err.name !== 'Error' ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  const prefix = errorName ? `${errorName}: ` : '';
  process.stderr.write(`${RED}${BOLD}anchored:${RESET} ${prefix}${message}\n`);

  // If the error carries a suggestions array (AnchoredError + subclasses),
  // render them as a bulleted list under the message.
  const suggestions =
    err && typeof err === 'object' && 'suggestions' in err
      ? (err as { suggestions: unknown }).suggestions
      : undefined;
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    process.stderr.write('\n');
    process.stderr.write(`${DIM}Suggestions:${RESET}\n`);
    for (const s of suggestions) {
      process.stderr.write(`  ${DIM}-${RESET} ${s}\n`);
    }
  }
}
