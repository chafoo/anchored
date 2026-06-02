import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { AcSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = AcSchema.extend({
  text: z.string().min(1),
});

export const setAcTextTool: AnchoredTool = {
  name: 'task__set_ac_text',
  description: 'Rewrite the prose of the ac_index-th acceptance criterion.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.ac.text.set(input.slug, input.phase_slug, input.ac_index, input.text);
  },
};
