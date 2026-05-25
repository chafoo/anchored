/**
 * Renderer for anchored task-files.
 *
 * Takes a typed TaskFile (matching the Zod schema in
 * `schema/task-file.ts`) and emits the Markdown that the parser
 * can read back. Round-trip-safe: `parse(render(taskFile))` should
 * produce a value semantically equivalent to `taskFile`.
 *
 * Output is deterministic and follows the canonical layout from
 * `plugin/references/task-file-schema.md`.
 */

import { stringify as stringifyYaml } from 'yaml';

import type {
  TaskFile,
  Phase,
  PhaseRule,
  AcceptanceCriterion,
} from '../schema/task-file.js';

/**
 * Render a TaskFile to a Markdown string.
 *
 * Conventions:
 *   - Frontmatter rendered as YAML between --- markers
 *   - Empty sections (Context.plan, Context.build, etc.) omitted
 *     (on-demand: section only appears if it has content)
 *   - Phases rendered in array order
 *   - Custom H2 sections appended after ## Phases
 *   - Newline at end of file
 */
export function render(file: TaskFile): string {
  const parts: string[] = [];

  parts.push(renderFrontmatter(file.frontmatter));
  parts.push('');
  parts.push(`# ${file.title}`);
  parts.push('');
  parts.push(renderContextSection(file.context));

  if (file.phases.length > 0) {
    parts.push('');
    parts.push('## Phases');
    parts.push('');
    for (const phase of file.phases) {
      parts.push(renderPhase(phase));
      parts.push('');
    }
  }

  // Custom H2 sections (preserved verbatim from the source)
  for (const [name, body] of Object.entries(file.customSections)) {
    parts.push(`## ${name}`);
    parts.push(body);
    parts.push('');
  }

  // Trim trailing empties, then add a single trailing newline
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────────────
// frontmatter
// ─────────────────────────────────────────────────────────────────────

function renderFrontmatter(fm: TaskFile['frontmatter']): string {
  // Combine known fields + extensions, in canonical key order for known
  // fields then extensions sorted alphabetically.
  const out: Record<string, unknown> = {
    slug: fm.slug,
    status: fm.status,
    created: fm.created,
  };
  const extKeys = Object.keys(fm.extensions).sort();
  for (const k of extKeys) {
    out[k] = fm.extensions[k];
  }
  const yamlBody = stringifyYaml(out, { lineWidth: 0 }).trimEnd();
  return ['---', yamlBody, '---'].join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Context section
// ─────────────────────────────────────────────────────────────────────

function renderContextSection(ctx: TaskFile['context']): string {
  const parts: string[] = ['## Context', ''];
  parts.push(ctx.intro);

  // ### Plan (on-demand)
  if (ctx.plan && ctx.plan.trim() !== '') {
    parts.push('');
    parts.push('### Plan');
    parts.push(ctx.plan);
  }

  // ### Build (on-demand — only if any H4 sub-section has content)
  const buildEntries = Object.entries(ctx.build).filter(
    ([, body]) => body && body.trim() !== '',
  );
  if (buildEntries.length > 0) {
    parts.push('');
    parts.push('### Build');
    for (const [name, body] of buildEntries) {
      parts.push('');
      parts.push(`#### ${name}`);
      parts.push(body);
    }
  }

  // ### Wrap (hybrid: intro + sub-sections)
  if (ctx.wrap) {
    const hasIntro = ctx.wrap.intro && ctx.wrap.intro.trim() !== '';
    const subEntries = Object.entries(ctx.wrap.subsections).filter(
      ([, body]) => body && body.trim() !== '',
    );
    if (hasIntro || subEntries.length > 0) {
      parts.push('');
      parts.push('### Wrap');
      if (hasIntro) {
        parts.push('');
        parts.push(ctx.wrap.intro!);
      }
      for (const [name, body] of subEntries) {
        parts.push('');
        parts.push(`#### ${name}`);
        parts.push(body);
      }
    }
  }

  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Phase
// ─────────────────────────────────────────────────────────────────────

function renderPhase(phase: Phase): string {
  const parts: string[] = [];
  parts.push(`### ${phase.name}`);
  parts.push(`<!-- id: ${phase.slug} -->`);
  parts.push(`- status: ${phase.status}`);

  // Extensions in alphabetical order for determinism
  const extKeys = Object.keys(phase.extensions).sort();
  for (const k of extKeys) {
    const v = phase.extensions[k];
    parts.push(`- ${k}: ${renderScalar(v)}`);
  }

  if (phase.context && phase.context.trim() !== '') {
    parts.push(`- context: ${phase.context}`);
  }

  if (phase.rules && phase.rules.length > 0) {
    parts.push('- rules:');
    for (const r of phase.rules) {
      parts.push(...renderRule(r));
    }
  }

  parts.push('- acceptance_criteria:');
  for (const ac of phase.acceptanceCriteria) {
    parts.push(...renderAC(ac));
  }

  return parts.join('\n');
}

function renderRule(rule: PhaseRule): string[] {
  return [
    `  - path: ${rule.path}`,
    `    why: ${rule.why}`,
  ];
}

function renderAC(ac: AcceptanceCriterion): string[] {
  return [
    `  - ${ac.text}`,
    `    evidence: ${ac.evidence}`,
  ];
}

function renderScalar(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return String(v);
}
