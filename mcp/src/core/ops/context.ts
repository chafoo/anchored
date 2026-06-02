/**
 * Context-section ops: intro / plan / build / wrap mutations plus
 * the refinement marker resolver.
 *
 * Build and wrap sections are keyed by subsection name (e.g.
 * "Implement"), with each value being the markdown content for
 * that subsection. The `subsection(name)` builder returns a pair
 * `{ append, set }` so callers can either grow a subsection
 * (append) or replace it wholesale (set).
 */

import { readTask, writeTask, type Deps } from './task.js';
import type { TaskFile } from '../../schema/task-file.js';
import { RefinementMarkerNotFound } from '../errors.js';

// ─────────────────────────────────────────────────────────────────────
// context.intro
// ─────────────────────────────────────────────────────────────────────

export function makeContextIntroSet({ root }: Deps) {
  return async (slug: string, content: string): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    file.context.intro = content;
    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// context.plan
// ─────────────────────────────────────────────────────────────────────

export function makeContextPlanAppend({ root }: Deps) {
  return async (slug: string, content: string): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const trimmed = content.trim();
    if (trimmed !== '') {
      file.context.plan = file.context.plan ? `${file.context.plan}\n${trimmed}` : trimmed;
    }
    return writeTask(root, slug, file);
  };
}

/**
 * Resolves the `q_index`-th refinement marker in `context.plan`.
 *
 * A refinement marker is a line containing `→ ?` — the plan-stage
 * agent emits these for open questions ("Q: should we cache? → ?").
 * The plan-check / rules-check gates iterate these markers and call
 * `refinement.resolve(slug, i, "yes — cache for 5min")` to swap
 * `→ ?` for `→ <resolution>` at the i-th marker.
 *
 * Markers are scanned in document order (top-to-bottom). The replace
 * is precise to that occurrence — it doesn't touch other `→ ?` markers
 * before or after.
 */
export function makeContextPlanRefinementResolve({ root }: Deps) {
  return async (slug: string, q_index: number, resolution: string): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    const plan = file.context.plan ?? '';
    const marker = '→ ?';

    // Walk through occurrences of the marker, find the q_index-th one.
    let count = 0;
    let pos = 0;
    let foundAt = -1;
    while (true) {
      const idx = plan.indexOf(marker, pos);
      if (idx === -1) break;
      if (count === q_index) {
        foundAt = idx;
        break;
      }
      count += 1;
      pos = idx + marker.length;
    }

    if (foundAt === -1) {
      throw new RefinementMarkerNotFound(
        `no '→ ?' marker at q_index ${q_index} in context.plan ` +
          `(found ${count} marker(s) total)`,
        [
          `Run \`anchored task read ${slug}\` and grep for '→ ?' to see the available markers and their indices.`,
          `Pass a 0-based index in range [0, ${Math.max(0, count - 1)}].`,
          count === 0
            ? `If the plan has no '→ ?' markers, refinement is already complete — no action needed.`
            : `Markers are scanned in document order top-to-bottom.`,
        ],
      );
    }

    const before = plan.slice(0, foundAt);
    const after = plan.slice(foundAt + marker.length);
    file.context.plan = `${before}→ ${resolution}${after}`;
    return writeTask(root, slug, file);
  };
}

// ─────────────────────────────────────────────────────────────────────
// context.build.subsection
// ─────────────────────────────────────────────────────────────────────

export function makeContextBuildSubsection({ root }: Deps) {
  return (name: string) => ({
    append: async (slug: string, content: string): Promise<TaskFile> => {
      const file = await readTask(root, slug);
      const trimmed = content.trim();
      if (trimmed !== '') {
        if (!file.context.build) file.context.build = {};
        const existing = file.context.build[name] ?? '';
        file.context.build[name] = existing ? `${existing}\n${trimmed}` : trimmed;
      }
      return writeTask(root, slug, file);
    },
    set: async (slug: string, content: string): Promise<TaskFile> => {
      const file = await readTask(root, slug);
      if (!file.context.build) file.context.build = {};
      file.context.build[name] = content;
      return writeTask(root, slug, file);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// context.wrap.intro + context.wrap.subsection
// ─────────────────────────────────────────────────────────────────────

export function makeContextWrapIntroSet({ root }: Deps) {
  return async (slug: string, content: string): Promise<TaskFile> => {
    const file = await readTask(root, slug);
    if (!file.context.wrap) file.context.wrap = {};
    file.context.wrap.intro = content;
    return writeTask(root, slug, file);
  };
}

export function makeContextWrapSubsection({ root }: Deps) {
  return (name: string) => ({
    append: async (slug: string, content: string): Promise<TaskFile> => {
      const file = await readTask(root, slug);
      const trimmed = content.trim();
      if (trimmed !== '') {
        if (!file.context.wrap) file.context.wrap = {};
        if (!file.context.wrap.subsections) {
          file.context.wrap.subsections = {};
        }
        const existing = file.context.wrap.subsections[name] ?? '';
        file.context.wrap.subsections[name] = existing ? `${existing}\n${trimmed}` : trimmed;
      }
      return writeTask(root, slug, file);
    },
    set: async (slug: string, content: string): Promise<TaskFile> => {
      const file = await readTask(root, slug);
      if (!file.context.wrap) file.context.wrap = {};
      if (!file.context.wrap.subsections) {
        file.context.wrap.subsections = {};
      }
      file.context.wrap.subsections[name] = content;
      return writeTask(root, slug, file);
    },
  });
}
