/** `anchored context ...` — append content to ## Context sub-sections. */

import type { Command } from 'commander';
import { contextAppend, type ContextSection } from '../../ops/core.js';

const VALID_SECTIONS: ContextSection[] = ['Plan', 'Build', 'Wrap'];

export function registerContextCommand(program: Command): void {
  const ctx = program
    .command('context')
    .description('append content to ## Context sub-sections');

  ctx
    .command('append')
    .description('append content to ### Plan, ### Build → #### <sub>, or ### Wrap')
    .argument('<slug>', 'task slug')
    .argument('<section>', `section name: ${VALID_SECTIONS.join(' | ')}`)
    .argument('[subsection]', 'H4 sub-section name (required for Build; optional for Wrap)')
    .argument('<content>', 'content to append (markdown allowed)')
    .action(
      async (
        slug: string,
        sectionArg: string,
        subsection: string | undefined,
        content: string,
        _opts,
        cmd,
      ) => {
        if (!VALID_SECTIONS.includes(sectionArg as ContextSection)) {
          throw new Error(
            `section must be one of ${VALID_SECTIONS.join(', ')} (got "${sectionArg}")`,
          );
        }
        const root = cmd.parent?.parent?.opts<{ root: string }>().root ?? process.cwd();
        await contextAppend(
          root,
          slug,
          sectionArg as ContextSection,
          subsection ?? null,
          content,
        );
        const where = subsection
          ? `### ${sectionArg} → #### ${subsection}`
          : `### ${sectionArg}`;
        process.stdout.write(`appended to ${where}\n`);
      },
    );
}
