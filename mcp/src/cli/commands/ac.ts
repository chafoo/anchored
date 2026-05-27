/**
 * `anchored ac ...` — acceptance-criterion subcommands.
 *
 * Mirrors the task.phase.ac.* MCP tool surface. Status set is restricted
 * to 'pending' (driving an AC to 'done' must go through `ac evidence set`
 * so the evidence array is filled atomically with the status flip).
 *
 * Subcommands:
 *   ac add <slug> <phase-slug> --text "..."
 *   ac remove <slug> <phase-slug> <idx>
 *   ac text set <slug> <phase-slug> <idx> <text>
 *   ac evidence set <slug> <phase-slug> <idx> <evidence...>
 *   ac evidence add <slug> <phase-slug> <idx> <line>
 *   ac failures set <slug> <phase-slug> <idx> <failures...>
 *   ac failures clear <slug> <phase-slug> <idx>
 *   ac status set <slug> <phase-slug> <idx> <status>
 */

import type { Command } from 'commander';
import { loadOps, parseIntArg, printUpdated } from '../helpers.js';

export function registerAcCommands(program: Command): void {
  const ac = program.command('ac').description('Acceptance-criterion operations');

  ac
    .command('add <slug> <phase-slug>')
    .description('append a new acceptance criterion to the phase')
    .requiredOption('--text <text>', 'AC text (required)')
    .action(
      async (slug: string, phaseSlug: string, opts: { text: string }) => {
        const ops = await loadOps(process.cwd());
        const file = await ops.task.phase.ac.add(slug, phaseSlug, {
          text: opts.text,
        });
        printUpdated(file);
      },
    );

  ac
    .command('remove <slug> <phase-slug> <idx>')
    .description('remove the AC at the given 0-based index')
    .action(async (slug: string, phaseSlug: string, idxArg: string) => {
      const idx = parseIntArg(idxArg, 'idx');
      const ops = await loadOps(process.cwd());
      const file = await ops.task.phase.ac.remove(slug, phaseSlug, idx);
      printUpdated(file);
    });

  // ac text set
  const text = ac.command('text').description('AC text ops');
  text
    .command('set <slug> <phase-slug> <idx> <text>')
    .description('rewrite the AC text in place (status + evidence unchanged)')
    .action(
      async (slug: string, phaseSlug: string, idxArg: string, newText: string) => {
        const idx = parseIntArg(idxArg, 'idx');
        const ops = await loadOps(process.cwd());
        const file = await ops.task.phase.ac.text.set(slug, phaseSlug, idx, newText);
        printUpdated(file);
      },
    );

  // ac evidence set / add
  const evidence = ac.command('evidence').description('AC evidence ops');
  evidence
    .command('set <slug> <phase-slug> <idx> <evidence...>')
    .description(
      "set evidence (atomically: status → 'done', failures cleared). Each <evidence> arg becomes one array element.",
    )
    .action(
      async (
        slug: string,
        phaseSlug: string,
        idxArg: string,
        evidenceArgs: string[],
      ) => {
        const idx = parseIntArg(idxArg, 'idx');
        const ops = await loadOps(process.cwd());
        const file = await ops.task.phase.ac.evidence.set(
          slug,
          phaseSlug,
          idx,
          evidenceArgs,
        );
        printUpdated(file);
      },
    );
  evidence
    .command('add <slug> <phase-slug> <idx> <line>')
    .description("append one evidence line (atomically: status → 'done')")
    .action(
      async (slug: string, phaseSlug: string, idxArg: string, line: string) => {
        const idx = parseIntArg(idxArg, 'idx');
        const ops = await loadOps(process.cwd());
        const file = await ops.task.phase.ac.evidence.add(
          slug,
          phaseSlug,
          idx,
          line,
        );
        printUpdated(file);
      },
    );

  // ac failures set / clear
  const failures = ac.command('failures').description('AC failures ops');
  failures
    .command('set <slug> <phase-slug> <idx> <failures...>')
    .description(
      "record failures (atomically: status → 'pending', evidence preserved as history)",
    )
    .action(
      async (
        slug: string,
        phaseSlug: string,
        idxArg: string,
        failureArgs: string[],
      ) => {
        const idx = parseIntArg(idxArg, 'idx');
        const ops = await loadOps(process.cwd());
        const file = await ops.task.phase.ac.failures.set(
          slug,
          phaseSlug,
          idx,
          failureArgs,
        );
        printUpdated(file);
      },
    );
  failures
    .command('clear <slug> <phase-slug> <idx>')
    .description('clear the failures array (status unchanged)')
    .action(async (slug: string, phaseSlug: string, idxArg: string) => {
      const idx = parseIntArg(idxArg, 'idx');
      const ops = await loadOps(process.cwd());
      const file = await ops.task.phase.ac.failures.clear(slug, phaseSlug, idx);
      printUpdated(file);
    });

  // ac status set (restricted to 'pending' — full reset)
  const status = ac.command('status').description('AC status ops');
  status
    .command('set <slug> <phase-slug> <idx> <status>')
    .description(
      "set AC status to 'pending' (full reset: clears evidence + failures). 'done' is not accepted here — use `ac evidence set` instead.",
    )
    .action(
      async (
        slug: string,
        phaseSlug: string,
        idxArg: string,
        statusArg: string,
      ) => {
        if (statusArg !== 'pending') {
          throw new Error(
            "ac status set only accepts 'pending' (use `ac evidence set` to drive an AC to 'done')",
          );
        }
        const idx = parseIntArg(idxArg, 'idx');
        const ops = await loadOps(process.cwd());
        const file = await ops.task.phase.ac.status.set(
          slug,
          phaseSlug,
          idx,
          'pending',
        );
        printUpdated(file);
      },
    );
}
