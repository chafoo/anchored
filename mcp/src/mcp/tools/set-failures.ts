import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { AcSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = AcSchema.extend({
  failures: z.array(z.string().min(1)).min(1),
});

export const setFailuresTool: AnchoredTool = {
  name: 'task__set_failures',
  description:
    'Record failure reasons for an AC. Atomically: flips status → "pending" and KEEPS evidence (the implement-agent retry loop reads both). Single write.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.ac.failures.set(
      input.slug,
      input.phase_slug,
      input.ac_index,
      input.failures,
    );
  },
};
