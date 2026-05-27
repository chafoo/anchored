/**
 * `anchored context ...` — context-section subcommands.
 *
 * Mirrors the task.context.* MCP tool surface. Context is structured
 * into three sub-trees:
 *   - intro: single string (replaced wholesale)
 *   - plan:  single string (append-only + refinement marker resolve)
 *   - build: keyed subsections (append | set per name)
 *   - wrap:  intro + keyed subsections (append | set per name)
 *
 * Subcommands:
 *   context intro set <slug> <content>
 *   context plan append <slug> <content>
 *   context plan resolve <slug> <q-index> <resolution>
 *   context build append <slug> <subsection> <content>
 *   context build set <slug> <subsection> <content>
 *   context wrap intro set <slug> <content>
 *   context wrap append <slug> <subsection> <content>
 *   context wrap set <slug> <subsection> <content>
 */

import type { Command } from 'commander';
import { loadOps, parseIntArg, printUpdated } from '../helpers.js';

export function registerContextCommands(program: Command): void {
  const ctx = program
    .command('context')
    .description('Context-section operations');

  // intro
  const intro = ctx.command('intro').description('Context intro ops');
  intro
    .command('set <slug> <content>')
    .description('replace context.intro with the given content')
    .action(async (slug: string, content: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.context.intro.set(slug, content);
      printUpdated(file);
    });

  // plan
  const plan = ctx.command('plan').description('Context plan ops');
  plan
    .command('append <slug> <content>')
    .description('append content to context.plan (trimmed, newline-joined)')
    .action(async (slug: string, content: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.context.plan.append(slug, content);
      printUpdated(file);
    });
  plan
    .command('resolve <slug> <q-index> <resolution>')
    .description(
      "swap the q-indexth '→ ?' marker in context.plan for '→ <resolution>'",
    )
    .action(async (slug: string, qIdxArg: string, resolution: string) => {
      const qIdx = parseIntArg(qIdxArg, 'q-index');
      const ops = await loadOps(process.cwd());
      const file = await ops.task.context.plan.refinement.resolve(
        slug,
        qIdx,
        resolution,
      );
      printUpdated(file);
    });

  // build
  const build = ctx.command('build').description('Context build subsection ops');
  build
    .command('append <slug> <subsection> <content>')
    .description('append content to context.build[<subsection>]')
    .action(async (slug: string, subsection: string, content: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.context.build
        .subsection(subsection)
        .append(slug, content);
      printUpdated(file);
    });
  build
    .command('set <slug> <subsection> <content>')
    .description('replace context.build[<subsection>] with the given content')
    .action(async (slug: string, subsection: string, content: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.context.build
        .subsection(subsection)
        .set(slug, content);
      printUpdated(file);
    });

  // wrap
  const wrap = ctx.command('wrap').description('Context wrap ops');
  const wrapIntro = wrap.command('intro').description('Context wrap intro ops');
  wrapIntro
    .command('set <slug> <content>')
    .description('replace context.wrap.intro with the given content')
    .action(async (slug: string, content: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.context.wrap.intro.set(slug, content);
      printUpdated(file);
    });
  wrap
    .command('append <slug> <subsection> <content>')
    .description('append content to context.wrap.subsections[<subsection>]')
    .action(async (slug: string, subsection: string, content: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.context.wrap
        .subsection(subsection)
        .append(slug, content);
      printUpdated(file);
    });
  wrap
    .command('set <slug> <subsection> <content>')
    .description(
      'replace context.wrap.subsections[<subsection>] with the given content',
    )
    .action(async (slug: string, subsection: string, content: string) => {
      const ops = await loadOps(process.cwd());
      const file = await ops.task.context.wrap
        .subsection(subsection)
        .set(slug, content);
      printUpdated(file);
    });
}
