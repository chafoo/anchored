// _v3/modules/task/task.fixtures.ts — sample task nodes for the task + cli specs.
import type { TaskNode } from './task.schemas.js'

export function taskNode(over: Partial<TaskNode> = {}): TaskNode {
  return { schema_version: 2, slug: 'my-task', title: 'T', status: 'plan', ...over }
}
