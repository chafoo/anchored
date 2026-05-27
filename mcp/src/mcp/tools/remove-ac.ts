import { zodToJsonSchema } from 'zod-to-json-schema';

import { AcSchema, withOps, type AnchoredTool } from './_shared.js';

export const removeAcTool: AnchoredTool = {
  name: 'task__remove_ac',
  description:
    'Remove the ac_index-th acceptance criterion from a phase. The schema requires ≥1 AC per phase — removing the last AC will fail at re-validate time.',
  inputSchema: zodToJsonSchema(AcSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = AcSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.ac.remove(input.slug, input.phase_slug, input.ac_index);
  },
};
