import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';

export const incrementRetryTool: AnchoredTool = {
  name: 'task__increment_retry',
  description:
    'Atomically increment phase.retry_count and return the new count. The build skill compares against anchored.yml.build.retry_limit to short-circuit the retry loop.',
  inputSchema: zodToJsonSchema(PhaseSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = PhaseSchema.parse(args);
    const ops = await withOps(input.project_root);
    const next = await ops.task.phase.retry_count.increment(input.slug, input.phase_slug);
    return { retry_count: next };
  },
};
