/**
 * `createOps(config, root): TaskOps` — the V0.2 pure-functional ops
 * factory.
 *
 * This is the SINGLE source of truth for task-file mutations. MCP
 * tools and CLI commands (built in P3 + P4) are thin transports over
 * this surface. The factory composes the per-module op builders into
 * the nested TaskOps shape defined below.
 *
 * Design principles:
 *   - No knowledge of MCP or CLI — pure functions only.
 *   - Every mutation goes through atomicWrite (temp + rename).
 *   - Every op validates the input shape, the state transition (where
 *     applicable), and re-validates the full file before persisting.
 *   - Errors are typed (src/core/errors.ts) and carry `suggestions[]`
 *     for the CLI/MCP layer to surface.
 *
 */

import type { AnchoredYml } from '../schema/anchored-yml.js';
import type {
  TaskFile,
  PhaseStatus,
  TaskStatus,
  PhaseRule,
  Autonomy,
  Question,
  QuestionPriority,
} from '../schema/task-file.js';

import {
  makeTaskCreate,
  makeTaskRead,
  makeTaskStatusSet,
  makeTaskTitleSet,
  makeTaskAutonomySet,
  type TaskCreateInput,
} from './ops/task.js';
import {
  makeQuestionAdd,
  makeQuestionList,
  makeQuestionResolve,
  makeQuestionRetag,
  type QuestionAddInput,
  type QuestionResolveInput,
  type QuestionListFilter,
} from './ops/question.js';
import {
  makeContextIntroSet,
  makeContextPlanAppend,
  makeContextPlanRefinementResolve,
  makeContextBuildSubsection,
  makeContextWrapIntroSet,
  makeContextWrapSubsection,
} from './ops/context.js';
import {
  makePhaseList,
  makePhaseNext,
  makePhaseAdd,
  makePhaseRemove,
  makePhaseMove,
  makePhaseStatusSet,
  makePhaseNameSet,
  makePhaseContextSet,
  makePhaseRulesSet,
  makePhaseRulesAdd,
  makePhaseRulesRemove,
  makePhaseRetryCountIncrement,
  type PhaseInit,
  type PhasePosition,
} from './ops/phase.js';
import {
  makeAcAdd,
  makeAcRemove,
  makeAcTextSet,
  makeAcEvidenceSet,
  makeAcEvidenceAdd,
  makeAcFailuresSet,
  makeAcFailuresClear,
  makeAcStatusSet,
  type AcInit,
} from './ops/ac.js';
import {
  makeFieldList,
  makeFieldSet,
  makeFieldGet,
} from './ops/field.js';

// ─────────────────────────────────────────────────────────────────────
// re-export init shapes for callers
// ─────────────────────────────────────────────────────────────────────

export type {
  TaskCreateInput,
  PhaseInit,
  PhasePosition,
  AcInit,
  QuestionAddInput,
  QuestionResolveInput,
  QuestionListFilter,
};

// ─────────────────────────────────────────────────────────────────────
// TaskOps surface
// ─────────────────────────────────────────────────────────────────────

export interface TaskOps {
  task: {
    create(slug: string, initial: TaskCreateInput): Promise<TaskFile>;
    read(slug: string): Promise<TaskFile>;
    status: { set(slug: string, status: TaskStatus): Promise<TaskFile> };
    title: { set(slug: string, title: string): Promise<TaskFile> };
    autonomy: { set(slug: string, autonomy: Autonomy): Promise<TaskFile> };

    question: {
      add(
        slug: string,
        input: QuestionAddInput,
      ): Promise<{ id: string; file: TaskFile }>;
      list(slug: string, filter?: QuestionListFilter): Promise<Question[]>;
      resolve(
        slug: string,
        id: string,
        input: QuestionResolveInput,
      ): Promise<TaskFile>;
      retag(
        slug: string,
        id: string,
        priority: QuestionPriority,
      ): Promise<TaskFile>;
    };

    context: {
      intro: { set(slug: string, content: string): Promise<TaskFile> };
      plan: {
        append(slug: string, content: string): Promise<TaskFile>;
        refinement: {
          resolve(
            slug: string,
            q_index: number,
            resolution: string,
          ): Promise<TaskFile>;
        };
      };
      build: {
        subsection(name: string): {
          append(slug: string, content: string): Promise<TaskFile>;
          set(slug: string, content: string): Promise<TaskFile>;
        };
      };
      wrap: {
        intro: { set(slug: string, content: string): Promise<TaskFile> };
        subsection(name: string): {
          append(slug: string, content: string): Promise<TaskFile>;
          set(slug: string, content: string): Promise<TaskFile>;
        };
      };
    };

    phase: {
      list(
        slug: string,
      ): Promise<{ name: string; slug: string; status: PhaseStatus }[]>;
      next(slug: string): Promise<{ name: string; slug: string } | null>;
      add(
        slug: string,
        init: PhaseInit,
        position?: PhasePosition,
      ): Promise<TaskFile>;
      remove(
        slug: string,
        phase_slug: string,
        opts?: { force?: boolean },
      ): Promise<TaskFile>;
      move(
        slug: string,
        phase_slug: string,
        target: PhasePosition,
      ): Promise<TaskFile>;

      status: {
        set(
          slug: string,
          phase_slug: string,
          status: PhaseStatus,
        ): Promise<TaskFile>;
      };
      name: {
        set(
          slug: string,
          phase_slug: string,
          name: string,
        ): Promise<TaskFile>;
      };
      context: {
        set(
          slug: string,
          phase_slug: string,
          content: string,
        ): Promise<TaskFile>;
      };

      rules: {
        set(
          slug: string,
          phase_slug: string,
          rules: PhaseRule[],
        ): Promise<TaskFile>;
        add(
          slug: string,
          phase_slug: string,
          rule: PhaseRule,
        ): Promise<TaskFile>;
        remove(
          slug: string,
          phase_slug: string,
          idx: number,
        ): Promise<TaskFile>;
      };

      retry_count: {
        increment(slug: string, phase_slug: string): Promise<number>;
      };

      ac: {
        add(
          slug: string,
          phase_slug: string,
          ac: AcInit,
        ): Promise<TaskFile>;
        remove(
          slug: string,
          phase_slug: string,
          idx: number,
        ): Promise<TaskFile>;
        text: {
          set(
            slug: string,
            phase_slug: string,
            idx: number,
            text: string,
          ): Promise<TaskFile>;
        };
        evidence: {
          set(
            slug: string,
            phase_slug: string,
            idx: number,
            evidence: string[],
          ): Promise<TaskFile>;
          add(
            slug: string,
            phase_slug: string,
            idx: number,
            line: string,
          ): Promise<TaskFile>;
        };
        failures: {
          set(
            slug: string,
            phase_slug: string,
            idx: number,
            failures: string[],
          ): Promise<TaskFile>;
          clear(
            slug: string,
            phase_slug: string,
            idx: number,
          ): Promise<TaskFile>;
        };
        status: {
          set(
            slug: string,
            phase_slug: string,
            idx: number,
            status: 'pending',
          ): Promise<TaskFile>;
        };
      };

      field: {
        list(): { name: string; type: string }[];
        set(
          slug: string,
          phase_slug: string,
          name: string,
          value: unknown,
        ): Promise<TaskFile>;
        get(
          slug: string,
          phase_slug: string,
          name: string,
        ): Promise<unknown>;
      };
    };
  };
}

// ─────────────────────────────────────────────────────────────────────
// factory
// ─────────────────────────────────────────────────────────────────────

export function createOps(config: AnchoredYml, root: string): TaskOps {
  const deps = { root };
  const fieldDeps = { config, root };

  return {
    task: {
      create: makeTaskCreate(deps),
      read: makeTaskRead(deps),
      status: { set: makeTaskStatusSet(deps) },
      title: { set: makeTaskTitleSet(deps) },
      autonomy: { set: makeTaskAutonomySet(deps) },

      question: {
        add: makeQuestionAdd(deps),
        list: makeQuestionList(deps),
        resolve: makeQuestionResolve(deps),
        retag: makeQuestionRetag(deps),
      },

      context: {
        intro: { set: makeContextIntroSet(deps) },
        plan: {
          append: makeContextPlanAppend(deps),
          refinement: {
            resolve: makeContextPlanRefinementResolve(deps),
          },
        },
        build: {
          subsection: makeContextBuildSubsection(deps),
        },
        wrap: {
          intro: { set: makeContextWrapIntroSet(deps) },
          subsection: makeContextWrapSubsection(deps),
        },
      },

      phase: {
        list: makePhaseList(deps),
        next: makePhaseNext(deps),
        add: makePhaseAdd(deps),
        remove: makePhaseRemove(deps),
        move: makePhaseMove(deps),

        status: { set: makePhaseStatusSet(deps) },
        name: { set: makePhaseNameSet(deps) },
        context: { set: makePhaseContextSet(deps) },

        rules: {
          set: makePhaseRulesSet(deps),
          add: makePhaseRulesAdd(deps),
          remove: makePhaseRulesRemove(deps),
        },

        retry_count: {
          increment: makePhaseRetryCountIncrement(deps),
        },

        ac: {
          add: makeAcAdd(deps),
          remove: makeAcRemove(deps),
          text: { set: makeAcTextSet(deps) },
          evidence: {
            set: makeAcEvidenceSet(deps),
            add: makeAcEvidenceAdd(deps),
          },
          failures: {
            set: makeAcFailuresSet(deps),
            clear: makeAcFailuresClear(deps),
          },
          status: { set: makeAcStatusSet(deps) },
        },

        field: {
          list: makeFieldList(fieldDeps),
          set: makeFieldSet(fieldDeps),
          get: makeFieldGet(fieldDeps),
        },
      },
    },
  };
}
