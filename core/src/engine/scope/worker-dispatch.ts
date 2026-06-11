// engine/scope/worker-dispatch.ts — maps a built-in step NAME to its worker ref.
// Policy/data, injectable: the engine never hardcodes step names; this is the
// single place that knows them. Workers themselves are plugin agents (Task
// plugin-agents); here it is only the name→ref mapping.

export interface WorkerRef {
  type: 'agent' | 'skill'
  ref: string
}

// step name → worker, per the default template + the agent roster (file-structure).
// NOTE: 'rules-scan' (task.plan) maps to a plan-rules-scan agent that the agent
// roster must add (it currently lists refine-rules-check only) — surfaced for
// Task plugin-agents.
const DEFAULT_WORKERS: Record<string, WorkerRef> = {
  implement: { type: 'agent', ref: 'build-implement' },
  'task-validate': { type: 'agent', ref: 'build-task-validate' },
  'code-validate': { type: 'agent', ref: 'build-code-validate' },
  discover: { type: 'agent', ref: 'plan-discover' },
  'rules-scan': { type: 'agent', ref: 'plan-rules-scan' },
  decompose: { type: 'agent', ref: 'plan-decompose' },
  'plan-check': { type: 'agent', ref: 'refine-plan-check' },
  'rules-check': { type: 'agent', ref: 'refine-rules-check' },
  walk: { type: 'skill', ref: 'walk' }, // skill-routing, NOT an agent
  review: { type: 'agent', ref: 'wrap-review' },
  summarize: { type: 'agent', ref: 'wrap-summarize' },
  scaffold: { type: 'agent', ref: 'epic-scaffold' },
  'epic-plan-check': { type: 'agent', ref: 'epic-plan-check' }, // D2: ground the epic vs code
  'epic-decompose': { type: 'agent', ref: 'epic-decompose' }, // D2: author per-stub task-ACs
  'roll-up': { type: 'agent', ref: 'epic-roll-up' },
}

// structural built-ins handled by the engine itself (not workers)
const STRUCTURAL = new Set(['loop', 'run'])

export function createWorkerDispatch(overrides: Record<string, WorkerRef> = {}) {
  const map: Record<string, WorkerRef> = { ...DEFAULT_WORKERS, ...overrides }
  return {
    resolveWorker(stepName: string): WorkerRef | undefined {
      return map[stepName]
    },
    isStructural(stepName: string): boolean {
      return STRUCTURAL.has(stepName)
    },
    names(): string[] {
      return Object.keys(map)
    },
  }
}
