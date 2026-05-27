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
 *   task autonomy set <slug> <level>          (V0.3)
 *   task question add <slug> --text ... --priority ... --origin ... [--phase ...]
 *   task question list <slug> [--priority ...] [--status ...] [--phase ...]
 *   task question resolve <slug> <id> --answer ... --source ... [--reasoning ...]
 *   task question retag <slug> <id> <priority>
 */

import type { Command } from 'commander';
import { loadOps, printTaskFile, printUpdated } from '../helpers.js';
import {
  TaskStatus,
  Autonomy,
  QuestionPriority,
  QuestionOrigin,
  QuestionStatus,
  QuestionSource,
} from '../../schema/task-file.js';

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

  // ─── V0.3: autonomy ────────────────────────────────────────────────
  const autonomy = task
    .command('autonomy')
    .description('Task-autonomy ops (V0.3)');
  autonomy
    .command('set <slug> <level>')
    .description(
      'set the autonomy level (ask_all | ask_high_only | decide_all) — idempotent, appends audit entry',
    )
    .action(async (slug: string, levelArg: string) => {
      const parsed = Autonomy.parse(levelArg);
      const ops = await loadOps(process.cwd());
      const file = await ops.task.autonomy.set(slug, parsed);
      printUpdated(file);
    });

  // ─── V0.3: question ────────────────────────────────────────────────
  const question = task
    .command('question')
    .description('Structured Q&A ops (V0.3)');

  question
    .command('add <slug>')
    .description('add a new question — returns the assigned q<N> id')
    .requiredOption('--text <text>', 'question prose')
    .requiredOption('--priority <level>', 'low | medium | high')
    .requiredOption(
      '--origin <agent>',
      'plan-agent | plan-check | rules-check | task-validate | code-validate | user',
    )
    .option('--phase <phase-slug>', 'optional phase the question pertains to')
    .action(
      async (
        slug: string,
        opts: { text: string; priority: string; origin: string; phase?: string },
      ) => {
        const priority = QuestionPriority.parse(opts.priority);
        const origin = QuestionOrigin.parse(opts.origin);
        const ops = await loadOps(process.cwd());
        const { id, file } = await ops.task.question.add(slug, {
          text: opts.text,
          priority,
          origin,
          ...(opts.phase !== undefined ? { phase: opts.phase } : {}),
        });
        // eslint-disable-next-line no-console
        console.log(`assigned id: ${id}`);
        printUpdated(file);
      },
    );

  question
    .command('list <slug>')
    .description('list questions (insertion order); filter via flags')
    .option('--priority <level>', 'low | medium | high')
    .option('--status <state>', 'open | resolved')
    .option('--phase <phase-slug>', 'filter to a specific phase')
    .action(
      async (
        slug: string,
        opts: { priority?: string; status?: string; phase?: string },
      ) => {
        const filter: {
          priority?: ReturnType<typeof QuestionPriority.parse>;
          status?: ReturnType<typeof QuestionStatus.parse>;
          phase?: string;
        } = {};
        if (opts.priority !== undefined)
          filter.priority = QuestionPriority.parse(opts.priority);
        if (opts.status !== undefined)
          filter.status = QuestionStatus.parse(opts.status);
        if (opts.phase !== undefined) filter.phase = opts.phase;
        const ops = await loadOps(process.cwd());
        const list = await ops.task.question.list(
          slug,
          Object.keys(filter).length === 0 ? undefined : filter,
        );
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(list, null, 2));
      },
    );

  question
    .command('resolve <slug> <id>')
    .description(
      'resolve a question by id — source=user (no reasoning) or source=ai (reasoning required)',
    )
    .requiredOption('--answer <text>', 'the decision / answer')
    .requiredOption('--source <who>', 'user | ai')
    .option('--reasoning <text>', 'required when source=ai; forbidden when source=user')
    .action(
      async (
        slug: string,
        id: string,
        opts: { answer: string; source: string; reasoning?: string },
      ) => {
        const source = QuestionSource.parse(opts.source);
        const ops = await loadOps(process.cwd());
        const file = await ops.task.question.resolve(slug, id, {
          answer: opts.answer,
          source,
          ...(opts.reasoning !== undefined ? { reasoning: opts.reasoning } : {}),
        });
        printUpdated(file);
      },
    );

  question
    .command('retag <slug> <id> <priority>')
    .description('change priority of an existing question (rare)')
    .action(async (slug: string, id: string, priorityArg: string) => {
      const priority = QuestionPriority.parse(priorityArg);
      const ops = await loadOps(process.cwd());
      const file = await ops.task.question.retag(slug, id, priority);
      printUpdated(file);
    });
}
