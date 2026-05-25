import { taskRead as taskReadOp } from '../../ops/core.js';
import { resolveProjectRoot, strProp, type AnchoredTool } from './index.js';

export const taskRead: AnchoredTool = {
  name: 'task_read',
  description:
    'Read the full parsed task-file as JSON. Useful for surfacing the current state of phases, ACs, and Context sub-sections to the orchestrator.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: strProp('task slug (matches .claude/tasks/<slug>.md filename)'),
      project_root: strProp('project root path (optional — falls back to env or cwd)'),
    },
    required: ['slug'],
  },
  handler: async (args) => {
    const root = resolveProjectRoot(args);
    return await taskReadOp(root, String(args['slug']));
  },
};
