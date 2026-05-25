/** `anchored task ...` — read + status mutations. */

import type { Command } from 'commander';
import { taskRead, taskStatusSet } from '../../ops/core.js';
import { TaskStatus } from '../../schema/task-file.js';

export function registerTaskCommand(program: Command): void {
  const task = program
    .command('task')
    .description('task-level operations (read, status transitions)');

  task
    .command('read')
    .description('read the full parsed task-file (JSON output)')
    .argument('<slug>', 'task slug (matches .claude/tasks/<slug>.md filename)')
    .action(async (slug: string, _opts, cmd) => {
      const root = cmd.parent?.parent?.opts<{ root: string }>().root ?? process.cwd();
      const file = await taskRead(root, slug);
      process.stdout.write(JSON.stringify(file, null, 2) + '\n');
    });

  task
    .command('status')
    .description('task status read/set')
    .addHelpText('after', `
Examples:
  $ anchored task status get my-task
  $ anchored task status set my-task wrap
`)
    .command('get')
    .argument('<slug>', 'task slug')
    .action(async (slug: string, _opts, cmd) => {
      const root = cmd.parent?.parent?.parent?.opts<{ root: string }>().root ?? process.cwd();
      const file = await taskRead(root, slug);
      process.stdout.write(file.frontmatter.status + '\n');
    });

  task
    .command('status set')
    .argument('<slug>', 'task slug')
    .argument('<status>', 'new status: plan | build | wrap | done')
    .action(async (slug: string, status: string, _opts, cmd) => {
      const root = cmd.parent?.parent?.opts<{ root: string }>().root ?? process.cwd();
      const parsed = TaskStatus.parse(status);
      const file = await taskStatusSet(root, slug, parsed);
      process.stdout.write(`task ${slug}: status → ${file.frontmatter.status}\n`);
    });
}
