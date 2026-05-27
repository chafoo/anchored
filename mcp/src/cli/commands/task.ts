/**
 * `anchored task ...` — task-level subcommands.
 *
 * Mirrors the task.* MCP tool surface 1:1 via the V0.2 ops factory
 * (src/core/factory.ts). Each action is a thin transport: parse args,
 * call `loadOps(root)`, invoke the typed op, render the result.
 *
 * Subcommands:
 *   task create <slug> --title "..."
 *   task read <slug>
 *   task status set <slug> <status>
 *   task title set <slug> <title>
 */

import type { Command } from 'commander';
import { loadOps, printTaskFile, printUpdated } from '../helpers.js';
import { TaskStatus } from '../../schema/task-file.js';

export function registerTaskCommands(program: Command): void {
  const task = program.command('task').description('Task-level operations');

  task
    .command('create <slug>')
    .description('create a new task-file at .claude/tasks/<slug>.yml')
    .option('--title <title>', 'task title (required)')
    .option('--intro <intro>', 'initial context.intro markdown')
    .action(async (slug: string, opts: { title?: string; intro?: string }) => {
      if (!opts.title) throw new Error('--title is required');
      const ops = await loadOps(process.cwd());
      const file = await ops.task.create(slug, {
        title: opts.title,
        ...(opts.intro !== undefined ? { intro: opts.intro } : {}),
      });
      printUpdated(file);
    });

  task
    .command('read <slug>')
    .description('print the full task-file as YAML')
    .action(async (slug: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.read(slug);
      printTaskFile(file);
    });

  const status = task.command('status').description('Task-status ops');
  status
    .command('set <slug> <status>')
    .description('transition the task status (state-machine enforced)')
    .action(async (slug: string, statusArg: string) => {
      const parsed = TaskStatus.parse(statusArg);
      const ops = await loadOps(process.cwd());
      const file = await ops.task.status.set(slug, parsed);
      printUpdated(file);
    });

  const title = task.command('title').description('Task-title ops');
  title
    .command('set <slug> <title>')
    .description('rename the task (title only — slug is immutable)')
    .action(async (slug: string, newTitle: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.title.set(slug, newTitle);
      printUpdated(file);
    });
}
