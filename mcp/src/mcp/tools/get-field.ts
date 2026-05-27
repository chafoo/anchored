import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';
import { z } from 'zod';

const InputSchema = PhaseSchema.extend({
  name: z.string().min(1),
});

export const getFieldTool: AnchoredTool = {
  name: 'task__get_field',
  description:
    'Get a declared phase field value. Returns undefined if the field is declared but not yet set. Throws InvalidFieldValue if the field name is not declared in anchored.yml.task.phase.fields.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.field.get(input.slug, input.phase_slug, input.name);
  },
};
