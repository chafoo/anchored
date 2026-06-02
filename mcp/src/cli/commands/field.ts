/**
 * `anchored field ...` — generic phase-extension-field subcommands.
 *
 * Mirrors the task.phase.field.* MCP tool surface. Fields are declared
 * in anchored.yml.task.phase.fields and validated at op-time against
 * the declared type. Reserved built-in keys (status, name, etc.) are
 * rejected — those have their own typed ops under `phase ...`.
 *
 * Subcommands:
 *   field list
 *   field set <slug> <phase-slug> <name> <value>
 *   field get <slug> <phase-slug> <name>
 */

import type { Command } from 'commander';
import { loadOps, printUpdated } from '../helpers.js';

export function registerFieldCommands(program: Command): void {
  const field = program.command('field').description('Phase extension-field operations');

  field
    .command('list')
    .description('list the phase fields declared in anchored.yml')
    .action(async () => {
      const ops = await loadOps(process.cwd());
      const fields = ops.task.phase.field.list();
      if (fields.length === 0) {
        process.stdout.write('(no fields declared in anchored.yml)\n');
        return;
      }
      const nameW = Math.max(...fields.map((f) => f.name.length), 'name'.length);
      const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - s.length));
      process.stdout.write(`${pad('name', nameW)}  type\n`);
      for (const f of fields) {
        process.stdout.write(`${pad(f.name, nameW)}  ${f.type}\n`);
      }
    });

  field
    .command('set <slug> <phase-slug> <name> <value>')
    .description('set a declared phase field value (type-coerced against anchored.yml)')
    .action(async (slug: string, phaseSlug: string, fieldName: string, value: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.phase.field.set(slug, phaseSlug, fieldName, value);
      printUpdated(file);
    });

  field
    .command('get <slug> <phase-slug> <name>')
    .description('read a phase field value (prints "null" if unset)')
    .action(async (slug: string, phaseSlug: string, fieldName: string) => {
      const ops = await loadOps(process.cwd());
      const value = await ops.task.phase.field.get(slug, phaseSlug, fieldName);
      process.stdout.write(value === null || value === undefined ? 'null\n' : `${String(value)}\n`);
    });
}
