/** `anchored phase field ...` — generic schema-driven field ops.
 *
 * (Registered under `phase field` to mirror the structure: phase.field.set/get.)
 */

import type { Command } from 'commander';
import { phaseFieldSet, phaseFieldGet } from '../../ops/field.js';

export function registerFieldCommand(program: Command): void {
  // Hooks under existing `phase` command — but commander doesn't expose
  // a clean way to mutate after registration, so register at top level
  // as `field` for V0.2. Users invoke as `anchored field set ...`.
  const field = program
    .command('field')
    .description('user-declared phase-field operations (set/get for task.phase.fields)');

  field
    .command('set')
    .description('set a declared phase field value (type-checked against anchored.yml)')
    .argument('<slug>', 'task slug')
    .argument('<phase_slug>', 'phase slug')
    .argument('<field_name>', 'field name as declared in anchored.yml task.phase.fields')
    .argument('<value>', 'value (coerced to declared type)')
    .action(
      async (
        slug: string,
        phaseSlug: string,
        fieldName: string,
        value: string,
        _opts,
        cmd,
      ) => {
        const root =
          cmd.parent?.parent?.opts<{ root: string }>().root ?? process.cwd();
        await phaseFieldSet(root, slug, phaseSlug, fieldName, value);
        process.stdout.write(
          `field ${fieldName} on ${phaseSlug}: set to ${value}\n`,
        );
      },
    );

  field
    .command('get')
    .description('read a phase field value (returns "null" if unset)')
    .argument('<slug>', 'task slug')
    .argument('<phase_slug>', 'phase slug')
    .argument('<field_name>', 'field name')
    .action(
      async (
        slug: string,
        phaseSlug: string,
        fieldName: string,
        _opts,
        cmd,
      ) => {
        const root =
          cmd.parent?.parent?.opts<{ root: string }>().root ?? process.cwd();
        const value = await phaseFieldGet(root, slug, phaseSlug, fieldName);
        process.stdout.write(`${value === null ? 'null' : String(value)}\n`);
      },
    );
}
