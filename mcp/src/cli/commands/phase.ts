/**
 * `anchored phase ...` — phase-level subcommands.
 *
 * Mirrors the task.phase.* MCP tool surface 1:1. Phase add/move accept
 * a positional flag triple (--after | --before | --to) parsed via the
 * shared helper.
 *
 * Subcommands:
 *   phase list <slug>
 *   phase next <slug>
 *   phase add <slug> --name "..." --slug "..." [--after | --before | --to]
 *   phase remove <slug> <phase-slug> [--force]
 *   phase move <slug> <phase-slug> [--after | --before | --to]
 *   phase status set <slug> <phase-slug> <status>
 *   phase executor set <slug> <phase-slug> <executor>
 *   phase name set <slug> <phase-slug> <name>
 *   phase context set <slug> <phase-slug> <content>
 *   phase rules set <slug> <phase-slug> <rules-json>
 *   phase retry increment <slug> <phase-slug>
 */

import type { Command } from 'commander';
import { loadOps, parsePhasePosition, printPhaseList, printUpdated } from '../helpers.js';
import { PhaseStatus, PhaseExecutor, PhaseRule } from '../../schema/task-file.js';
import { AnchoredError } from '../../core/errors.js';
import { z } from 'zod';

export function registerPhaseCommands(program: Command): void {
  const phase = program.command('phase').description('Phase-level operations');

  phase
    .command('list <slug>')
    .description('list phases in this task (name, slug, status)')
    .action(async (slug: string) => {
      const ops = await loadOps(process.cwd());
      const phases = await ops.task.phase.list(slug);
      printPhaseList(phases);
    });

  phase
    .command('next <slug>')
    .description('print the next non-terminal phase slug (in-progress | pending)')
    .action(async (slug: string) => {
      const ops = await loadOps(process.cwd());
      const next = await ops.task.phase.next(slug);
      process.stdout.write(next ? `${next.slug}\n` : 'no pending phases\n');
    });

  phase
    .command('add <slug>')
    .description('add a new phase')
    .requiredOption('--name <name>', 'phase name (display)')
    .requiredOption('--slug <phase-slug>', 'phase slug (kebab-case)')
    .option('--after <phase-slug>', 'insert after this phase slug')
    .option('--before <phase-slug>', 'insert before this phase slug')
    .option('--to <start|end>', 'insert at start or end (default: end)')
    .action(
      async (
        slug: string,
        opts: {
          name: string;
          slug: string;
          after?: string;
          before?: string;
          to?: string;
        },
      ) => {
        const position = parsePhasePosition(opts);
        const ops = await loadOps(process.cwd());
        const file = await ops.task.phase.add(slug, { name: opts.name, slug: opts.slug }, position);
        printUpdated(file);
      },
    );

  phase
    .command('remove <slug> <phase-slug>')
    .description('remove a phase (refuses done-status phases unless --force)')
    .option('--force', 'force removal of a done phase (discards proven work)')
    .action(async (slug: string, phaseSlug: string, opts: { force?: boolean }) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.phase.remove(slug, phaseSlug, {
        force: !!opts.force,
      });
      printUpdated(file);
    });

  phase
    .command('move <slug> <phase-slug>')
    .description('move a phase to a new position in the phases array')
    .option('--after <phase-slug>', 'move after this phase slug')
    .option('--before <phase-slug>', 'move before this phase slug')
    .option('--to <start|end>', 'move to start or end')
    .action(
      async (
        slug: string,
        phaseSlug: string,
        opts: { after?: string; before?: string; to?: string },
      ) => {
        const position = parsePhasePosition(opts);
        if (!position) {
          throw new AnchoredError('must pass one of --after, --before, or --to', [
            'Pass exactly one position flag: --after <phase-slug>, --before <phase-slug>, or --to <start|end>.',
          ]);
        }
        const ops = await loadOps(process.cwd());
        const file = await ops.task.phase.move(slug, phaseSlug, position);
        printUpdated(file);
      },
    );

  // phase status set
  const status = phase.command('status').description('Phase-status ops');
  status
    .command('set <slug> <phase-slug> <status>')
    .description('transition a phase status (state-machine enforced)')
    .action(async (slug: string, phaseSlug: string, statusArg: string) => {
      const parsed = PhaseStatus.parse(statusArg);
      const ops = await loadOps(process.cwd());
      const file = await ops.task.phase.status.set(slug, phaseSlug, parsed);
      printUpdated(file);
    });

  // phase executor set
  const executor = phase.command('executor').description('Phase-executor ops');
  executor
    .command('set <slug> <phase-slug> <executor>')
    .description(
      'set which worker runs this phase during build (implement | workflow) — does not change phase status',
    )
    .action(async (slug: string, phaseSlug: string, executorArg: string) => {
      const parsed = PhaseExecutor.parse(executorArg);
      const ops = await loadOps(process.cwd());
      const file = await ops.task.phase.executor.set(slug, phaseSlug, parsed);
      printUpdated(file);
    });

  // phase name set
  const name = phase.command('name').description('Phase-name ops');
  name
    .command('set <slug> <phase-slug> <name>')
    .description('rename a phase (display name only — slug is immutable)')
    .action(async (slug: string, phaseSlug: string, newName: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.phase.name.set(slug, phaseSlug, newName);
      printUpdated(file);
    });

  // phase context set
  const ctx = phase.command('context').description('Phase-context ops');
  ctx
    .command('set <slug> <phase-slug> <content>')
    .description("replace the phase's context string")
    .action(async (slug: string, phaseSlug: string, content: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.phase.context.set(slug, phaseSlug, content);
      printUpdated(file);
    });

  // phase rules set (rules-json)
  const rules = phase.command('rules').description('Phase-rules ops');
  rules
    .command('set <slug> <phase-slug> <rules-json>')
    .description('replace the phase rules array with a JSON array of { path, why } objects')
    .action(async (slug: string, phaseSlug: string, rulesJson: string) => {
      const parsed = z.array(PhaseRule).parse(JSON.parse(rulesJson));
      const ops = await loadOps(process.cwd());
      const file = await ops.task.phase.rules.set(slug, phaseSlug, parsed);
      printUpdated(file);
    });

  // phase retry increment
  const retry = phase.command('retry').description('Phase retry-count ops');
  retry
    .command('increment <slug> <phase-slug>')
    .description('atomically increment phase.retry_count, returning the new value')
    .action(async (slug: string, phaseSlug: string) => {
      const ops = await loadOps(process.cwd());
      const count = await ops.task.phase.retry_count.increment(slug, phaseSlug);
      process.stdout.write(`${count}\n`);
    });
}
