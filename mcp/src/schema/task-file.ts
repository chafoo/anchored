/**
 * Zod schema for the parsed task-file shape — what `parse(md)` returns
 * and what `render(data)` accepts.
 *
 * Mirrors plugin/references/task-file-schema.md (the human-readable spec).
 * The line-based parser produces this shape; the renderer consumes it.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────
// enums
// ─────────────────────────────────────────────────────────────────────

export const TaskStatus = z.enum(['plan', 'build', 'wrap', 'done']);
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

/** A single must-follow rule that applies to a specific phase. */
export const PhaseRule = z.object({
  path: z.string().min(1),
  why: z.string().min(1),
});
export type PhaseRule = z.infer<typeof PhaseRule>;

/** One acceptance criterion with its evidence slot. */
export const AcceptanceCriterion = z.object({
  text: z.string().min(1),
  /** "—" while pending, concrete reference once implemented. Never empty string. */
  evidence: z.string().min(1),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterion>;

/**
 * A phase = one logical unit of work that ships as one commit-or-PR.
 * Extensions (user-declared phase fields from anchored.yml.task.phase.fields)
 * land in `extensions` as a string-keyed record.
 */
export const Phase = z.object({
  /** Human Title Case name, unique within the task. */
  name: z.string().min(1),
  /** kebab-case slug derived from name; lives in HTML comment. */
  slug: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, {
    message: 'phase slug must be kebab-case',
  }),
  status: PhaseStatus,
  /** Optional phase-specific briefing for build-agent. */
  context: z.string().optional(),
  /** Optional per-phase rules. May be omitted entirely if none apply. */
  rules: z.array(PhaseRule).optional(),
  /** Always at least 1 AC. */
  acceptanceCriteria: z.array(AcceptanceCriterion).min(1, {
    message: 'every phase needs at least one acceptance criterion',
  }),
  /**
   * User-declared phase fields (commit, coverage_pct, pr_url, etc.).
   * Type validation happens at op-level (field.set) against
   * anchored.yml.task.phase.fields declarations — this just preserves
   * the raw value on round-trip.
   */
  extensions: z.record(z.string(), z.unknown()).default({}),
});
export type Phase = z.infer<typeof Phase>;

// ─────────────────────────────────────────────────────────────────────
// Context section (with on-demand sub-sections)
// ─────────────────────────────────────────────────────────────────────

/**
 * H4 sub-sections under ### Build (Implement, task-check, code-check,
 * or any user-custom agent). On-demand: only present if content was
 * written. Key = subsection name (matching H4 heading), value = the
 * markdown content under it.
 */
export const BuildSubsections = z.record(z.string(), z.string()).default({});
export type BuildSubsections = z.infer<typeof BuildSubsections>;

/**
 * The ### Wrap section is hybrid: a free-prose TL;DR (intro) plus
 * optional H4 sub-sections like #### review.
 */
export const WrapSection = z.object({
  intro: z.string().optional(),
  subsections: z.record(z.string(), z.string()).default({}),
});
export type WrapSection = z.infer<typeof WrapSection>;

export const ContextSection = z.object({
  /** The unchanging framing under ## Context (before any ### sub-section). */
  intro: z.string(),
  /** ### Plan — decisions + Q&A + open questions. On-demand. */
  plan: z.string().optional(),
  /** ### Build → H4 sub-sections per writing agent. On-demand. */
  build: BuildSubsections,
  /** ### Wrap — TL;DR + sub-sections. On-demand. */
  wrap: WrapSection.optional(),
});
export type ContextSection = z.infer<typeof ContextSection>;

// ─────────────────────────────────────────────────────────────────────
// frontmatter
// ─────────────────────────────────────────────────────────────────────

export const Frontmatter = z.object({
  slug: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, {
    message: 'task slug must be kebab-case',
  }),
  status: TaskStatus,
  /** ISO date YYYY-MM-DD. */
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'created must be ISO date YYYY-MM-DD',
  }),
  /** Forward-compatible: unknown keys round-trip preserved. */
  extensions: z.record(z.string(), z.unknown()).default({}),
});
export type Frontmatter = z.infer<typeof Frontmatter>;

// ─────────────────────────────────────────────────────────────────────
// full task-file
// ─────────────────────────────────────────────────────────────────────

export const TaskFile = z.object({
  frontmatter: Frontmatter,
  /** H1 title. */
  title: z.string().min(1),
  context: ContextSection,
  phases: z.array(Phase),
  /**
   * Custom H2 body sections (e.g. `## Risk Assessment`) the user
   * added. Preserved verbatim. Key = section name, value = raw
   * markdown content.
   */
  customSections: z.record(z.string(), z.string()).default({}),
});
export type TaskFile = z.infer<typeof TaskFile>;

export function parseTaskFile(raw: unknown): TaskFile {
  return TaskFile.parse(raw);
}

export function safeParseTaskFile(
  raw: unknown,
): { ok: true; value: TaskFile } | { ok: false; error: z.ZodError } {
  const result = TaskFile.safeParse(raw);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error };
}
