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
    name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, {
      message: 'phase field name must be snake_case (lowercase + underscores)',
    }),
    type: PhaseFieldType,
    values: z.array(z.string()).optional(),
    default: z.unknown().optional(),
  })
  .refine(
    (decl) => decl.type !== 'enum' || (decl.values !== undefined && decl.values.length > 0),
    { message: "enum-typed fields require a non-empty 'values' array" },
  );
export type PhaseFieldDecl = z.infer<typeof PhaseFieldDecl>;

export const TaskExtensions = z.object({
  phase: z
    .object({
      fields: z.array(PhaseFieldDecl).default([]),
    })
    .default({ fields: [] }),
}).default({ phase: { fields: [] } });
export type TaskExtensions = z.infer<typeof TaskExtensions>;

// ─────────────────────────────────────────────────────────────────────
// lifecycle steps — plan / build / wrap
// ─────────────────────────────────────────────────────────────────────

export const StepProse = z.string().min(1, {
  message: 'step prose cannot be empty — write what the AI should do, or omit the key',
});

/** A lifecycle phase config — bag of named steps. Reserved names have
 *  framework semantics (plan: explore/rules/refine,
 *  build: implement/task_check/code_check, wrap: review/summarize).
 *  Other names are custom user steps run in declaration order. */
export const LifecycleConfig = z.record(z.string(), StepProse).default({});
export type LifecycleConfig = z.infer<typeof LifecycleConfig>;

// ─────────────────────────────────────────────────────────────────────
// top-level anchored.yml shape
// ─────────────────────────────────────────────────────────────────────

export const AnchoredYml = z.object({
  task: TaskExtensions,
  plan: LifecycleConfig,
  build: LifecycleConfig,
  wrap: LifecycleConfig,
});
export type AnchoredYml = z.infer<typeof AnchoredYml>;

export function parseAnchoredYml(raw: unknown): AnchoredYml {
  return AnchoredYml.parse(raw ?? {});
}

export function safeParseAnchoredYml(
  raw: unknown,
): { ok: true; value: AnchoredYml } | { ok: false; error: z.ZodError } {
  const result = AnchoredYml.safeParse(raw ?? {});
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error };
}
