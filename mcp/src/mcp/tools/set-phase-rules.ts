import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { PhaseRule } from '../../schema/task-file.js';
import { PhaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = PhaseSchema.extend({
  rules: z.array(PhaseRule),
});

export const setPhaseRulesTool: AnchoredTool = {
  name: 'task__set_phase_rules',
  description:
    'Replace phase.rules wholesale with the provided array. Each rule is {path, why} — the path is a glob the implement agent must respect.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.phase.rules.set(input.slug, input.phase_slug, input.rules);
  },
};
