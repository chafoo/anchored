import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  section: z.string().min(1),
  content: z.string(),
});

export const appendBuildSectionTool: AnchoredTool = {
  name: 'task__append_build_section',
  description:
    'Append markdown to a named subsection under context.build (e.g. "Implement"). Creates the subsection if absent; whitespace-only content is a no-op.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.context.build
      .subsection(input.section)
      .append(input.slug, input.content);
  },
};
