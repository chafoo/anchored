import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  autonomy: z
    .enum(['ask_all', 'ask_high_only', 'decide_all'])
    .describe(
      'ask_all = user decides every question, failures block immediately. ask_high_only = AI resolves low+medium, user gets high, failures retry then block. decide_all = AI resolves everything, failures retry then mark phase blocked + continue.',
    ),
});

export const setAutonomyTool: AnchoredTool = {
  name: 'task__set_autonomy',
  description:
    'Set (or override) the task autonomy level. Idempotent — calling on a task that already has autonomy set replaces the value and appends an audit line to context.plan (`autonomy override: old → new` + ISO timestamp). Called by /impl-refine stage 0 and the /impl-build skip-refine gate.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.autonomy.set(input.slug, input.autonomy);
  },
};
