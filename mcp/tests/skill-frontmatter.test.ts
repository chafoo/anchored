/**
 * Skill frontmatter contract — assert every shipped skill has a valid
 * YAML frontmatter block with at least a `description` field. Skills
 * are loaded by Claude Code's plugin runtime via their frontmatter;
 * malformed or missing frontmatter means the skill is invisible to
 * the runtime (silent failure).
 *
 * Also asserts the expected set of skills exists (impl, impl-plan,
 * impl-refine, impl-build, impl-wrap) so adding a new lifecycle skill
 * forces a deliberate test update.
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', '..', 'plugin', 'skills');

interface ParsedSkill {
  name: string;
  filePath: string;
  raw: string;
  frontmatter: {
    name?: string;
    description?: string;
  };
  body: string;
}

async function listSkills(): Promise<ParsedSkill[]> {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const parsed: ParsedSkill[] = [];
  for (const name of skillDirs) {
    const filePath = join(SKILLS_DIR, name, 'SKILL.md');
    try {
      await stat(filePath);
    } catch {
      // No SKILL.md in this directory — not a skill directory.
      continue;
    }
    const raw = await readFile(filePath, 'utf-8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      throw new Error(`skill ${name} (${filePath}) has no YAML frontmatter`);
    }
    const frontmatter = parseYaml(match[1]!) as ParsedSkill['frontmatter'];
    const body = match[2]!;
    parsed.push({ name, filePath, raw, frontmatter, body });
  }
  return parsed;
}

describe('skill frontmatter — every SKILL.md has valid frontmatter', () => {
  it('finds at least one skill to validate (smoke)', async () => {
    const skills = await listSkills();
    expect(skills.length).toBeGreaterThan(0);
  });

  it('every skill has a non-empty `description` in its frontmatter', async () => {
    const skills = await listSkills();
    for (const s of skills) {
      expect(
        s.frontmatter.description,
        `skill ${s.name} is missing a frontmatter description`,
      ).toBeTruthy();
      expect(
        typeof s.frontmatter.description === 'string' &&
          s.frontmatter.description.trim().length > 0,
        `skill ${s.name} has an empty description`,
      ).toBe(true);
    }
  });

  it('every skill declares a `name` matching its directory name', async () => {
    const skills = await listSkills();
    for (const s of skills) {
      expect(
        s.frontmatter.name,
        `skill ${s.name} is missing a frontmatter name`,
      ).toBe(s.name);
    }
  });
});

describe('skill frontmatter — known anchored skills are present', () => {
  it('impl-refine skill exists with valid frontmatter', async () => {
    const skills = await listSkills();
    const refine = skills.find((s) => s.name === 'impl-refine');
    expect(refine, 'plugin/skills/impl-refine/SKILL.md must exist').toBeDefined();
    expect(refine!.frontmatter.description).toBeTruthy();
    expect(refine!.frontmatter.description!.length).toBeGreaterThan(20);
  });

  it('all four lifecycle skills (plan / refine / build / wrap) ship', async () => {
    const skills = await listSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('impl-plan');
    expect(names).toContain('impl-refine');
    expect(names).toContain('impl-build');
    expect(names).toContain('impl-wrap');
  });

  it('the autopilot skill (/impl) ships', async () => {
    const skills = await listSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('impl');
  });
});
