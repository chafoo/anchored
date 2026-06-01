/**
 * Zod schema for anchored.yml — the user's config file at project root.
 *
 * Validates the structure the orchestrator + agents expect to read.
 * Source of truth for what's a legal config; both CLI and MCP frontends
 * import from here.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────
// task — schema extensions (per-phase custom fields)
// ─────────────────────────────────────────────────────────────────────

/** Type tags for user-declared phase fields. */
export const PhaseFieldType = z.enum(['string', 'number', 'boolean', 'enum']);
export type PhaseFieldType = z.infer<typeof PhaseFieldType>;

/**
 * A user-declared phase field — e.g. commit SHA, coverage %, PR URL.
 * The parser preserves these on every phase; field ops validate
 * against this declaration.
 */
export const PhaseFieldDecl = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_]*$/, {
        message: 'phase field name must be snake_case (lowercase + underscores)',
      }),
    type: PhaseFieldType,
    values: z.array(z.string()).optional(),
    default: z.unknown().optional(),
  })
  .refine((decl) => decl.type !== 'enum' || (decl.values !== undefined && decl.values.length > 0), {
    message: "enum-typed fields require a non-empty 'values' array",
  });
export type PhaseFieldDecl = z.infer<typeof PhaseFieldDecl>;

export const TaskExtensions = z
  .object({
    phase: z
      .object({
        fields: z.array(PhaseFieldDecl).default([]),
      })
      .default({ fields: [] }),
  })
  .default({ phase: { fields: [] } });
export type TaskExtensions = z.infer<typeof TaskExtensions>;

// ─────────────────────────────────────────────────────────────────────
// lifecycle steps — plan / refine / build / wrap
// ─────────────────────────────────────────────────────────────────────

/**
 * A lifecycle step entry. Exactly one of `run` (inline prose
 * instructions executed by the orchestrator) or `use` (named tool
 * reference, e.g. `use: anchored/implement`) must be set — the
 * refine guarantees a step is either prose-driven or tool-driven,
 * never both.
 */
export const Step = z
  .object({
    name: z.string().min(1),
    run: z.string().min(1).optional(),
    use: z.string().min(1).optional(),
  })
  .refine((s) => Number(s.run !== undefined) + Number(s.use !== undefined) === 1, {
    message: 'step needs exactly one of run|use',
  });
export type Step = z.infer<typeof Step>;

/** Reserved-slot config — instructions-only override block. `.strict()`
 *  rejects unknown keys (e.g. legacy `enabled` flag) with a clear error. */
const ReservedSlot = z
  .object({
    instructions: z.string().optional(),
  })
  .strict();

// Plan + Wrap are simple step bags (no reserved slots in V0.2):
const PlanConfig = z
  .object({
    steps: z.array(Step).default([]),
  })
  .strict()
  .default({ steps: [] });

const WrapConfig = z
  .object({
    steps: z.array(Step).default([]),
  })
  .strict()
  .default({ steps: [] });

/** Refine stage: refinement gates between plan and build.
 *  Reserved slots: plan_check, rules_check. Strict on extras to
 *  reject legacy `enabled` flags + typos. */
const RefineConfig = z
  .object({
    steps: z.array(Step).default([]),
    plan_check: ReservedSlot.default({}),
    rules_check: ReservedSlot.default({}),
  })
  .strict()
  .default({ steps: [], plan_check: {}, rules_check: {} });

/**
 * Build stage: per-phase implementation + post-phase validation gates.
 *
 * Reserved slots:
 *   - implement     — the per-phase implement worker (methodology prose).
 *   - task_validate — AC-evidence gate.
 *   - code_validate — rules/quality gate.
 *   - stop_check    — the {instructions} slot enriches the build-time
 *                     stop-condition evaluator (plugin/agents/stop-check.md);
 *                     prose appended to its default brief. Symmetric with the
 *                     other reserved slots; distinct from `stop` (the rules
 *                     array the evaluator judges against).
 *
 * `retry_limit` caps how many times the build loop retries on a failed gate.
 *
 * `stop` — GLOBAL stop-conditions. A flat array of plain natural-language
 *   strings, one stop-rule per element. During an autonomous build run the
 *   orchestrator halts and hands control back to the user whenever a
 *   situation matches any rule in this list. Semantics:
 *     - empty / absent  → fully autonomous: the build never self-halts.
 *     - non-empty       → the build stops on the FIRST matching condition.
 *   The goal is to MINIMIZE stops, so the shipped default carries exactly
 *   one rule: 'a decision deviates from the plan'. NOT per-worker, NOT
 *   per-phase — a single global list for the whole build pipeline.
 *
 * Strict on extras to reject legacy `commit` slot + typos.
 */
const BuildConfig = z
  .object({
    steps: z.array(Step).default([]),
    retry_limit: z.number().int().min(1).default(3),
    implement: ReservedSlot.default({}),
    task_validate: ReservedSlot.default({}),
    code_validate: ReservedSlot.default({}),
    stop_check: ReservedSlot.default({}),
    stop: z.array(z.string().min(1)).default(['a decision deviates from the plan']),
  })
  .strict()
  .default({
    steps: [],
    retry_limit: 3,
    implement: {},
    task_validate: {},
    code_validate: {},
    stop_check: {},
    stop: ['a decision deviates from the plan'],
  });

export type PlanConfig = z.infer<typeof PlanConfig>;
export type RefineConfig = z.infer<typeof RefineConfig>;
export type BuildConfig = z.infer<typeof BuildConfig>;
export type WrapConfig = z.infer<typeof WrapConfig>;

// ─────────────────────────────────────────────────────────────────────
// top-level anchored.yml shape
// ─────────────────────────────────────────────────────────────────────

export const AnchoredYml = z
  .object({
    task: TaskExtensions,
    plan: PlanConfig,
    refine: RefineConfig,
    build: BuildConfig,
    wrap: WrapConfig,
  })
  .strict();
export type AnchoredYml = z.infer<typeof AnchoredYml>;

export function parseAnchoredYml(raw: unknown): AnchoredYml {
  return AnchoredYml.parse(raw ?? {});
}

export function safeParseAnchoredYml(
  raw: unknown,
): { ok: true; value: AnchoredYml } | { ok: false; error: z.ZodError } {
  const result = AnchoredYml.safeParse(raw ?? {});
  return result.success ? { ok: true, value: result.data } : { ok: false, error: result.error };
}
