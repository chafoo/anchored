/**
 * Default-config shape — assert plugin/references/default-config.yml
 * follows the tsconfig-style layout: a short header + commented-out
 * slots covering the full customization surface, no active values.
 *
 * This file ships with the plugin and is what /impl-plan copies to
 * the user's project root on first use. If we silently ship an
 * `anchored.yml` with active defaults (instead of commented-out
 * templates), users editing the file lose track of what's framework
 * default vs. their override. Tsconfig-style — empty + commented —
 * keeps the customization surface discoverable without forcing
 * choices.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(
  __dirname,
  '..',
  '..',
  'plugin',
  'references',
  'default-config.yml',
);

async function loadConfig(): Promise<string> {
  return readFile(CONFIG_PATH, 'utf-8');
}

describe('default-config.yml — tsconfig-style template', () => {
  it('the file exists and is readable', async () => {
    const raw = await loadConfig();
    expect(raw.length).toBeGreaterThan(0);
  });

  it('starts with a short header (first 4 non-blank lines all begin with `#`)', async () => {
    const raw = await loadConfig();
    const nonBlank = raw
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .slice(0, 4);
    expect(nonBlank.length).toBe(4);
    for (const line of nonBlank) {
      expect(line.startsWith('#'), `header line is not a comment: "${line}"`).toBe(true);
    }
  });

  it('includes every required customization slot (in commented form)', async () => {
    const raw = await loadConfig();
    const requiredSlots = [
      'task:',
      'phase:',
      'fields:',
      'plan:',
      'refine:',
      'plan_check:',
      'rules_check:',
      'build:',
      'retry_limit',
      'task_validate:',
      'code_validate:',
      'wrap:',
      'steps:',
      'instructions:',
    ];
    for (const slot of requiredSlots) {
      expect(
        raw.includes(slot),
        `default-config.yml is missing required slot reference: "${slot}"`,
      ).toBe(true);
    }
  });

  it('contains no `build.commit` slot — anchored is VCS-agnostic', async () => {
    const raw = await loadConfig();
    // We forbid an actual `commit:` slot under `build:`. The VCS-integration
    // doc comment may mention "build.commit" in prose ("there is intentionally
    // no build.commit slot") and may mention `commit` inside a shell-command
    // example value — those are fine. The forbidden shape is a YAML mapping
    // key named `commit:` nested under `build:`. Detect by scanning for
    // commit-as-key lines that are themselves slots (not list-item dicts
    // like `- { name: commit, ... }`).
    const lines = raw.split('\n');
    const commitSlotLines = lines.filter((l) =>
      // `commit:` or `# commit:` as a key — leading whitespace + optional `#`
      // followed by a comment marker, then `commit:` at end of token.
      // Excludes inline-flow-mapping list items like `- { name: commit, ... }`.
      /^\s*#?\s*commit\s*:\s*($|[^,}])/.test(l) &&
      !l.includes('{') &&
      !l.includes('}'),
    );
    expect(
      commitSlotLines,
      `default-config.yml must not declare a build.commit slot; found: ${JSON.stringify(commitSlotLines)}`,
    ).toEqual([]);
  });

  it('contains no legacy `task_check` or `code_check` names', async () => {
    const raw = await loadConfig();
    expect(raw).not.toMatch(/\btask_check\b/);
    expect(raw).not.toMatch(/\bcode_check\b/);
  });

  it('has zero active (uncommented) key-value pairs at the top level', async () => {
    const raw = await loadConfig();
    // An "active" top-level mapping line looks like `<word>:` at column 0
    // (no leading whitespace, not a comment).
    const lines = raw.split('\n');
    const activeTopLevel = lines.filter((l) => /^[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(l));
    expect(
      activeTopLevel,
      `default-config.yml should ship empty (commented-out) but has active top-level keys: ${JSON.stringify(activeTopLevel)}`,
    ).toEqual([]);
  });

  it('mentions both impl-refine gates and impl-build gates somewhere', async () => {
    const raw = await loadConfig();
    // Sanity: the four always-on gates are referenced (by config slot, not by gate name).
    // plan_check + rules_check are refine-stage; task_validate + code_validate are build-stage.
    expect(raw).toMatch(/plan_check/);
    expect(raw).toMatch(/rules_check/);
    expect(raw).toMatch(/task_validate/);
    expect(raw).toMatch(/code_validate/);
  });

  it('documents the VCS-agnostic integration pattern in an inline comment', async () => {
    const raw = await loadConfig();
    // The "how to integrate VCS" inline comment lives in the file.
    expect(raw.toLowerCase()).toMatch(/vcs/);
  });
});
