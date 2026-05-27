import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = PhaseSchema.extend({
  name: z.string().min(1),
});

export const setPhaseNameTool: AnchoredTool = {
  name: 'task__set_phase_name',
  description:
    'Rename a phase — overwrites phase.name. The slug is the stable identifier and cannot be changed.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.name.set(input.slug, input.phase_slug, input.name);
  },
};
