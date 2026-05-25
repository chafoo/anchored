/** `anchored phase ...` — phase-level operations. */

import type { Command } from 'commander';
import { phaseNextPending, phaseStatusSet } from '../../ops/core.js';
import { PhaseStatus } from '../../schema/task-file.js';

export function registerPhaseCommand(program: Command): void {
  const phase = program
    .command('phase')
    .description('phase-level operations (status, next-pending, field)');

  phase
    .command('next-pending')
    .description('return the next non-terminal phase (or empty if none)')
    .argument('<slug>', 'task slug')
    .action(async (slug: string, _opts, cmd) => {
      const root = cmd.parent?.parent?.opts<{ root: string }>().root ?? process.cwd();
      const next = await phaseNextPending(root, slug);
      if (next === null) {
        process.stdout.write('(none — all phases terminal)\n');
      } else {
        process.stdout.write(JSON.stringify(next, null, 2) + '\n');
      }
    });

  const status = phase.command('status').description('per-phase status read/set');

  status
    .command('set')
    .description('set the status of a specific phase')
    .argument('<slug>', 'task slug')
    .argument('<phase_slug>', 'phase slug (internal id from <!-- id: ... -->)')
    .argument('<status>', 'new phase status: pending | in-progress | done | blocked | deferred')
    .action(async (slug: string, phaseSlug: string, statusArg: string, _opts, cmd) => {
      const root = cmd.parent?.parent?.parent?.opts<{ root: string }>().root ?? process.cwd();
      const parsed = PhaseStatus.parse(statusArg);
      const file = await phaseStatusSet(root, slug, phaseSlug, parsed);
      const updated = file.phases.find((p) => p.slug === phaseSlug);
      process.stdout.write(
        `phase ${phaseSlug}: status → ${updated?.status ?? statusArg}\n`,
      );
    });
}
