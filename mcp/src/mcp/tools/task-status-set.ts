import { taskStatusSet as taskStatusSetOp } from '../../ops/core.js';
import { TaskStatus } from '../../schema/task-file.js';
import { resolveProjectRoot, strProp, type AnchoredTool } from './index.js';

export const taskStatusSet: AnchoredTool = {
  name: 'task_status_set',
  description:
    'Transition the task-level status, enforcing the forward-only state machine (plan → build → wrap → done). Throws InvalidTransition on illegal moves.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: strProp('task slug'),
      status: {
        type: 'string',
        enum: ['plan', 'build', 'wrap', 'done'],
        description: 'target task status',
      },
      project_root: strProp('project root (optional)'),
    },
    required: ['slug', 'status'],
  },
  handler: async (args) => {
    const root = resolveProjectRoot(args);
    const status = TaskStatus.parse(args['status']);
    await taskStatusSetOp(root, String(args['slug']), status);
    return { ok: true, status };
  },
};
