import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { AcSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = AcSchema.extend({
  status: z.literal('pending'),
});

export const setAcStatusTool: AnchoredTool = {
  name: 'task__set_ac_status',
  description:
    'Reset an AC to "pending" — clears BOTH evidence + failures. The clean-slate op for plan-stage scope changes. Transitions to "done" must go through set_evidence so evidence + status flip atomically.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.ac.status.set(
      input.slug,
      input.phase_slug,
      input.ac_index,
      input.status,
    );
  },
};
