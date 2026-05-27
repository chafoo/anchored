import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = PhaseSchema.extend({
  name: z.string().min(1),
  value: z.unknown(),
});

export const setFieldTool: AnchoredTool = {
  name: 'task__set_field',
  description:
    'Set a declared phase field. Field name must be declared in anchored.yml.task.phase.fields; value is coerced to the declared type. Throws InvalidFieldValue for undeclared names or reserved names (status, name, context, rules, acceptance_criteria, retry_count, slug).',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.field.set(input.slug, input.phase_slug, input.name, input.value);
  },
};
