/**
 * Communication-style contract — the pair-programmer voice doc is the
 * single source of truth for how anchored speaks to users in chat.
 * Skills and agents are required to point at it (rather than embed
 * their own contradictory voice rules), which means the reference
 * doc has to actually exist + have the structure callers rely on.
 *
 * Phase 12 of the V0.2 refactor introduced this surface; these tests
 * catch the two regressions that would silently break it:
 *   1. The reference doc is missing or has been gutted of its
 *      Principle / Self-check / contrast-pair / exceptions sections.
 *   2. A SKILL.md drops its "Communication style" pointer (which
 *      makes the skill's voice drift away from the central guide).
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..', '..', 'plugin');
const REF_DOC = join(PLUGIN_ROOT, 'references', 'communication-style.md');
const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listSkillFiles(): Promise<string[]> {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const result: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const skillPath = join(SKILLS_DIR, e.name, 'SKILL.md');
    if (await fileExists(skillPath)) result.push(skillPath);
  }
  return result;
}

describe('communication-style.md — canonical voice reference', () => {
  it('exists at plugin/references/communication-style.md', async () => {
    expect(
      await fileExists(REF_DOC),
      `expected ${REF_DOC} to exist — see plugin/references/communication-style.md`,
    ).toBe(true);
  });

  it('has a Principle section', async () => {
    const body = await readFile(REF_DOC, 'utf-8');
    expect(/^##\s+Principle/m.test(body), 'expected "## Principle" heading').toBe(true);
  });

  it('has a Self-check section', async () => {
    const body = await readFile(REF_DOC, 'utf-8');
    expect(/^##\s+Self-check/mi.test(body), 'expected "## Self-check" heading').toBe(true);
  });

  it('has at least 6 contrast pairs (machinery voice vs partner voice)', async () => {
    const body = await readFile(REF_DOC, 'utf-8');
    // Count markdown table rows that look like contrast pairs.
    // A pair is a table row with two cells separated by ` | `, where
    // neither cell is the header / separator row.
    const rows = body
      .split('\n')
      .filter((line) => /^\s*\|.+\|.+\|\s*$/.test(line))
      .filter((line) => !/^\s*\|[\s|:-]+\|\s*$/.test(line)) // drop separator rows
      .filter((line) => !/Avoid.*Prefer/i.test(line)); // drop header row
    expect(
      rows.length,
      `expected ≥6 contrast pair rows in tables, got ${rows.length}`,
    ).toBeGreaterThanOrEqual(6);
  });

  it('has a "When the machinery DOES matter" exceptions section', async () => {
    const body = await readFile(REF_DOC, 'utf-8');
    expect(
      /machinery\s+(?:does|DOES)\s+matter/i.test(body),
      'expected a section mentioning when the machinery voice is correct (verbose mode, errors, audit, etc.)',
    ).toBe(true);
  });
});

describe('SKILL.md files — every skill points to the voice reference', () => {
  it('finds the 5 expected lifecycle skills', async () => {
    const files = await listSkillFiles();
    const names = files.map((f) => f.split('/').slice(-2, -1)[0]).sort();
    expect(names).toEqual(['impl', 'impl-build', 'impl-plan', 'impl-refine', 'impl-wrap']);
  });

  it('every SKILL.md has a "Communication style" section', async () => {
    const files = await listSkillFiles();
    for (const f of files) {
      const body = await readFile(f, 'utf-8');
      expect(
        /^##\s+Communication style/m.test(body),
        `${f} is missing a "## Communication style" section — add a pointer to plugin/references/communication-style.md`,
      ).toBe(true);
    }
  });

  it('every SKILL.md links to plugin/references/communication-style.md', async () => {
    const files = await listSkillFiles();
    for (const f of files) {
      const body = await readFile(f, 'utf-8');
      expect(
        body.includes('communication-style.md'),
        `${f} does not reference plugin/references/communication-style.md — the per-skill section should point at the canonical doc, not duplicate it`,
      ).toBe(true);
    }
  });
});
