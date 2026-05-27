/**
 * Zod schema for the (YAML-native) task-file format.
 *
 * The format uses pure YAML + Zod validation. The Zod schema below IS
 * the spec — what parses, what doesn't, what's optional, what's required.
 * The corresponding human-readable doc in plugin/references/task-file-schema.md
 * mirrors this file 1:1.
 *
 * Key shape notes:
 *   - file extension is `.yml`
 *   - `schema_version: 2` literal in the top-level structure (gates
 *     compatibility; parser refuses other values with a clear error)
 *   - phase extension fields (commit, coverage_pct, pr_url, etc.)
 *     live as TOP-LEVEL phase keys rather than nested under
 *     `extensions:` — YAML's natural shape, no special handling
 *   - `customSections` is a top-level field
 *
 * Multi-line strings (evidence, context.intro, plan/build/wrap
 * content) are first-class via YAML block scalars (`|`).
 */

import { z } from 'zod';

/**
 * Stable identifier for the task-file schema. Value stays at `2` —
 * the literal is forward-proofing for a future v3 schema; do not change.
 */
export const SCHEMA_VERSION = 2 as const;

// ─────────────────────────────────────────────────────────────────────
// shared primitives
// ─────────────────────────────────────────────────────────────────────

const KebabSlug = z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, {
  message: 'slug must be kebab-case (lower-case letters, digits, hyphens; starts with a letter)',
});

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'created must be ISO date YYYY-MM-DD',
});

// ─────────────────────────────────────────────────────────────────────
// enums
// ─────────────────────────────────────────────────────────────────────

/**
 * Task-level status — the 6-state V0.2 lifecycle.
 *
 *   plan     — orchestrator running plan stage (writing context, ACs)
 *   drafted  — plan complete, awaiting refinement gates (plan-check + rules-check)
 *   refined  — refinement gates passed, ready to build
 *   build    — implementation in progress (per-phase work)
 *   wrap     — all phases terminal, review/summarize stage
 *   done     — task complete
 *
 * Backward transition to `drafted` from any forward state is the
 * "update-mode" path — surface for user-driven scope changes mid-flight.
 * The shortcut `drafted → build` skips refinement (orchestrator warns).
 */
export const TaskStatus = z.enum([
  'plan',
  'drafted',
  'refined',
  'build',
  'wrap',
  'done',
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const PhaseStatus = z.enum([
  'pending',
  'in-progress',
  'done',
  'blocked',
  'deferred',
]);
export type PhaseStatus = z.infer<typeof PhaseStatus>;

// ─────────────────────────────────────────────────────────────────────
// per-phase shape
// ─────────────────────────────────────────────────────────────────────

export const PhaseRule = z.object({
  path: z.string().min(1),
  why: z.string().min(1),
});
export type PhaseRule = z.infer<typeof PhaseRule>;

/**
 * One acceptance criterion — V0.2 shape.
 *
 *   text:     human-readable statement of what must be true.
 *   status:   "pending" while unproven, "done" once evidence is filled.
 *   evidence: optional array of concrete proof strings (file:line refs,
 *             test cmd + result, commit SHA, etc.). Each element non-empty,
 *             non-whitespace, and not the legacy em-dash sentinel `'—'`.
 *             If `status === 'done'`, evidence must be present + non-empty.
 *   failures: optional array of failure descriptions captured during
 *             validation runs (drives build retry loop). Each element
 *             non-empty. Cleared on a successful evidence set.
 *
 * Atomicity contract (enforced at the op layer, not the schema):
 *   - setting evidence transitions `status` to `done` and clears `failures`
 *   - both fields move together; no torn state on disk
 *
 * The em-dash sentinel `'—'` is rejected (no longer accepted as a
 * placeholder); a pending AC simply omits `evidence` rather than
 * stashing a sentinel string.
 */
const EvidenceItem = z
  .string()
  .min(1)
  .refine((s) => s.trim().length > 0 && s.trim() !== '—', {
    message:
      "evidence string cannot be whitespace-only or the legacy em-dash sentinel '—'",
  });

export const AcceptanceCriterion = z
  .object({
    text: z.string().min(1),
    status: z.enum(['pending', 'done']),
    evidence: z.array(EvidenceItem).min(1).optional(),
    failures: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine(
    (ac) =>
      ac.status !== 'done' || (ac.evidence !== undefined && ac.evidence.length > 0),
    { message: "AC with status='done' must have non-empty evidence" },
  );
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterion>;

/**
 * A phase. Extension fields (commit, coverage_pct, pr_url, etc.)
 * are passthrough — Zod preserves any extra keys verbatim via
 * `.passthrough()`. Type validation against `anchored.yml.task.phase.fields`
 * declarations still happens at the field.set op level.
 */
export const Phase = z
  .object({
    name: z.string().min(1),
    slug: KebabSlug,
    status: PhaseStatus,
    context: z.string().optional(),
    rules: z.array(PhaseRule).optional(),
    acceptance_criteria: z.array(AcceptanceCriterion).min(1, {
      message: 'every phase needs at least one acceptance criterion',
    }),
    /**
     * Number of times this phase has been re-attempted by the build
     * loop after a failed validation gate. Compared against
     * `build.retry_limit` in `anchored.yml` to short-circuit the
     * retry loop and surface a manual-intervention prompt.
     */
    retry_count: z.number().int().nonnegative().optional(),
  })
  .passthrough();
export type Phase = z.infer<typeof Phase>;

// ─────────────────────────────────────────────────────────────────────
// context section — direct YAML shape (no markdown parsing)
// ─────────────────────────────────────────────────────────────────────

/**
 * H4 sub-sections under build/wrap — keyed by sub-section name
 * (e.g. "Implement"), value is the markdown content for that
 * sub-section.
 */
const SubsectionMap = z.record(z.string(), z.string());

export const WrapSection = z.object({
  intro: z.string().optional(),
  subsections: SubsectionMap.optional(),
});
export type WrapSection = z.infer<typeof WrapSection>;

export const ContextSection = z.object({
  intro: z.string(),
  plan: z.string().optional(),
  build: SubsectionMap.optional(),
  wrap: WrapSection.optional(),
});
export type ContextSection = z.infer<typeof ContextSection>;

// ─────────────────────────────────────────────────────────────────────
// full task-file
// ─────────────────────────────────────────────────────────────────────

export const TaskFile = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    slug: KebabSlug,
    status: TaskStatus,
    created: IsoDate,
    title: z.string().min(1),
    context: ContextSection,
    /**
     * Phase slugs must be unique within a task — they're the stable
     * identifier callers pass to every phase-level op (`phase.add`,
     * `phase.status.set`, etc.). A duplicate slug would make every
     * lookup ambiguous (first match wins silently). The Zod refine
     * below catches it at parse-time with a message that names the
     * offending slug; the `phase.add` op also pre-checks before
     * writing so the error surfaces with a recovery suggestion.
     */
    phases: z.array(Phase).superRefine((phases, ctx) => {
      const seen = new Map<string, number>();
      const duplicates = new Map<string, number[]>();
      phases.forEach((p, i) => {
        const prev = seen.get(p.slug);
        if (prev !== undefined) {
          const indices = duplicates.get(p.slug) ?? [prev];
          indices.push(i);
          duplicates.set(p.slug, indices);
        } else {
          seen.set(p.slug, i);
        }
      });
      for (const [slug, indices] of duplicates) {
        const lastIndex = indices[indices.length - 1];
        if (lastIndex === undefined) continue; // unreachable; satisfies TS
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `duplicate phase slug "${slug}" at indices [${indices.join(', ')}] — ` +
            `phase slugs must be unique within a task`,
          path: [lastIndex, 'slug'],
        });
      }
    }),
    customSections: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();
export type TaskFile = z.infer<typeof TaskFile>;

// ─────────────────────────────────────────────────────────────────────
// parse helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Strict parse — throws on any validation failure. Use when invalid
 * input is genuinely unrecoverable.
 */
export function parseTaskFile(raw: unknown): TaskFile {
  return TaskFile.parse(raw);
}

/**
 * Safe parse — returns a discriminated union for callers that want
 * to surface a graceful error message instead of throwing.
 */
export function safeParseTaskFile(
  raw: unknown,
):
  | { ok: true; value: TaskFile }
  | { ok: false; error: z.ZodError } {
  const result = TaskFile.safeParse(raw);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error };
}
