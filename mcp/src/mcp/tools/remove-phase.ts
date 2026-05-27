import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = PhaseSchema.extend({
  force: z.boolean().optional(),
});

export const removePhaseTool: AnchoredTool = {
  name: 'task__remove_phase',
  description:
    'Remove a phase. Refuses done-status phases unless `force: true` is passed — done phases carry proven evidence and removal discards audit history.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.remove(input.slug, input.phase_slug, {
      force: input.force ?? false,
    });
  },
};
