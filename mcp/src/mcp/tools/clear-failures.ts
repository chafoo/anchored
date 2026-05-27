import { zodToJsonSchema } from 'zod-to-json-schema';

import { AcSchema, withOps, type AnchoredTool } from './_shared.js';

export const clearFailuresTool: AnchoredTool = {
  name: 'task__clear_failures',
  description:
    'Remove the failures field from an AC. Status is UNCHANGED — used after a successful retry as prologue to evidence.set (which flips status to "done").',
  inputSchema: zodToJsonSchema(AcSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = AcSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.ac.failures.clear(input.slug, input.phase_slug, input.ac_index);
  },
};
