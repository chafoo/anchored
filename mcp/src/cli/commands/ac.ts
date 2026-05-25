/** `anchored ac ...` — acceptance-criterion operations. */

import type { Command } from 'commander';
import { acList, acEvidenceSet } from '../../ops/core.js';

export function registerAcCommand(program: Command): void {
  const ac = program
    .command('ac')
    .description('acceptance-criterion operations (list, evidence)');

  ac
    .command('list')
    .description('list all acceptance criteria for a phase with their evidence')
    .argument('<slug>', 'task slug')
    .argument('<phase_slug>', 'phase slug')
    .action(async (slug: string, phaseSlug: string, _opts, cmd) => {
      const root = cmd.parent?.parent?.opts<{ root: string }>().root ?? process.cwd();
      const acs = await acList(root, slug, phaseSlug);
      acs.forEach((ac, i) => {
        process.stdout.write(`[${i}] ${ac.text}\n      evidence: ${ac.evidence}\n`);
      });
    });

  const evidence = ac.command('evidence').description('evidence-string operations');

  evidence
    .command('set')
    .description('set evidence for one acceptance criterion (non-empty required)')
    .argument('<slug>', 'task slug')
    .argument('<phase_slug>', 'phase slug')
    .argument('<ac_index>', '0-based index of the criterion within the phase')
    .argument('<evidence>', 'concrete evidence string (file:line | command + outcome | test name)')
    .action(
      async (
        slug: string,
        phaseSlug: string,
        acIndexArg: string,
        evidenceStr: string,
        _opts,
        cmd,
      ) => {
        const root =
          cmd.parent?.parent?.parent?.opts<{ root: string }>().root ?? process.cwd();
        const acIndex = parseInt(acIndexArg, 10);
        if (!Number.isInteger(acIndex)) {
          throw new Error(`ac_index must be an integer (got "${acIndexArg}")`);
        }
        await acEvidenceSet(root, slug, phaseSlug, acIndex, evidenceStr);
        process.stdout.write(`ac[${acIndex}] in ${phaseSlug}: evidence set\n`);
      },
    );
}
