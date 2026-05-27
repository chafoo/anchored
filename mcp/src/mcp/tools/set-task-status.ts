import { zodToJsonSchema } from 'zod-to-json-schema';

import { TaskStatus } from '../../schema/task-file.js';
import { BaseSchema, withOps, type AnchoredTool } from './_shared.js';

const InputSchema = BaseSchema.extend({
  status: TaskStatus,
});

export const setTaskStatusTool: AnchoredTool = {
  name: 'task__set_task_status',
  description:
    'Transition the task-level status, enforcing the forward-only state machine (plan → drafted → refined → build → wrap → done). Refuses wrap when phases are non-terminal.',
  inputSchema: zodToJsonSchema(InputSchema) as Record<string, unknown>,
  handler: async (args) => {
    const input = InputSchema.parse(args);
    const ops = await withOps(input.project_root);
    return ops.task.status.set(input.slug, input.status);
  },
};
